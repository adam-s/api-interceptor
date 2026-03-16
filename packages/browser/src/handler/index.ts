/**
 * Browser WebSocket Handler
 *
 * Adapts the browser lifecycle logic from browser.ts to work with
 * raw Node.js `ws` WebSocket instead of Hono's UpgradeWebSocket.
 *
 * This is the bridge between the raw WebSocket server in index.ts
 * and the fully-implemented RemoteBrowserService + interceptor pipeline.
 *
 * @module browser/handler
 */

import type { WebSocket } from 'ws';
import {
	BrowserLifecycleManager,
	browserLogger,
	createProfile,
	type FrameData,
	getProfilePath,
	profileExists,
	RemoteBrowserService,
} from '../remote/index.js';
import type { GenericInterceptor } from '../shared/interceptor.js';
import { GenericSessionManager } from '../shared/session-manager.js';
import type { InterceptedRequest, InterceptedResponse } from '../shared/types.js';
import { type DomainPlugin, getDomain } from './domain-loader.js';

// --- Constants ---

const VIEWPORT_WIDTH = 1024;
const VIEWPORT_HEIGHT = 576;

// --- Browser State (module-level singleton — one browser at a time) ---

let activeBrowser: RemoteBrowserService | null = null;
let activeInterceptor: GenericInterceptor | null = null;
let activePlugin: DomainPlugin | undefined;
let browserReady = false;
let currentProfile: string | null = null;
let currentDomain: string | null = null;

// --- Traffic Capture Buffer ---

interface TrafficEntry {
	id: number;
	timestamp: number;
	method: string;
	url: string;
	requestHeaders: Record<string, string>;
	requestBody: unknown;
	status: number;
	responseHeaders: Record<string, string>;
	responseBody: unknown;
	durationMs: number;
}

const MAX_TRAFFIC_ENTRIES = 200;
const MAX_BODY_SIZE = 50_000;

let trafficBuffer: TrafficEntry[] = [];
let trafficIdCounter = 0;

function addTrafficEntry(req: InterceptedRequest, res: InterceptedResponse): void {
	let responseBody = res.body;
	try {
		const bodyStr = JSON.stringify(responseBody);
		if (bodyStr.length > MAX_BODY_SIZE) {
			responseBody = {
				_truncated: true,
				_size: bodyStr.length,
				_preview: bodyStr.slice(0, 2000),
			};
		}
	} catch {
		/* not serializable */
	}

	trafficBuffer.push({
		id: ++trafficIdCounter,
		timestamp: req.timestamp,
		method: req.method,
		url: req.url,
		requestHeaders: req.headers,
		requestBody: req.body,
		status: res.status,
		responseHeaders: res.headers,
		responseBody,
		durationMs: res.timestamp - req.timestamp,
	});

	if (trafficBuffer.length > MAX_TRAFFIC_ENTRIES) {
		trafficBuffer.shift();
	}
}

// --- Traffic Buffer Accessors (used by REST endpoints in index.ts) ---

export function getTrafficEntries(sinceId?: number): {
	entries: TrafficEntry[];
	total: number;
	oldestId: number;
	newestId: number;
} {
	let entries = trafficBuffer;
	if (sinceId !== undefined && !Number.isNaN(sinceId)) {
		entries = entries.filter((e) => e.id > sinceId);
	}
	return {
		entries,
		total: trafficBuffer.length,
		oldestId: trafficBuffer[0]?.id ?? 0,
		newestId: trafficBuffer[trafficBuffer.length - 1]?.id ?? 0,
	};
}

export function getTrafficSummary(): {
	totalEntries: number;
	uniqueEndpoints: number;
	endpoints: Array<{ pattern: string; count: number; methods: string[]; statuses: number[] }>;
} {
	const urlPatterns = new Map<
		string,
		{ count: number; methods: Set<string>; statuses: Set<number> }
	>();
	for (const entry of trafficBuffer) {
		const pattern = entry.url
			.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{id}')
			.replace(/\/\d+\//g, '/{id}/')
			.replace(/\?.*$/, '');
		const existing = urlPatterns.get(pattern) || {
			count: 0,
			methods: new Set(),
			statuses: new Set(),
		};
		existing.count++;
		existing.methods.add(entry.method);
		existing.statuses.add(entry.status);
		urlPatterns.set(pattern, existing);
	}

	const endpoints = Array.from(urlPatterns.entries()).map(([pattern, data]) => ({
		pattern,
		count: data.count,
		methods: Array.from(data.methods),
		statuses: Array.from(data.statuses),
	}));

	return {
		totalEntries: trafficBuffer.length,
		uniqueEndpoints: endpoints.length,
		endpoints: endpoints.sort((a, b) => b.count - a.count),
	};
}

export function clearTrafficBuffer(): number {
	const count = trafficBuffer.length;
	trafficBuffer = [];
	return count;
}

export function getBrowserHealth(): {
	status: string;
	browser: { active: boolean; ready: boolean; profile: string | null; domain: string | null };
	lifecycle: unknown;
	metrics: unknown;
	timestamp: string;
} {
	const lifecycleManager = BrowserLifecycleManager.getInstance();
	return {
		status: 'ok',
		browser: {
			active: activeBrowser !== null,
			ready: browserReady,
			profile: currentProfile,
			domain: currentDomain,
		},
		lifecycle: lifecycleManager.getStatus(),
		metrics: browserLogger.getMetrics(),
		timestamp: new Date().toISOString(),
	};
}

// --- Safe send helpers ---

function wsSend(ws: WebSocket, data: string | Buffer | Uint8Array): void {
	try {
		ws.send(data);
	} catch {
		// Client may have disconnected
	}
}

function wsSendJson(ws: WebSocket, obj: unknown): void {
	wsSend(ws, JSON.stringify(obj));
}

// --- WebSocket Handler ---

/**
 * Handle a browser streaming WebSocket connection.
 *
 * This is called from index.ts when a WebSocket connects to /browser/stream.
 * It manages the full browser lifecycle: launch, stream frames, handle input,
 * capture traffic, and clean up on disconnect.
 */
export async function handleBrowserWebSocket(ws: WebSocket, requestUrl: URL): Promise<void> {
	const profile = requestUrl.searchParams.get('profile') || undefined;
	const url = requestUrl.searchParams.get('url') || undefined;
	const captureDomainsParam = requestUrl.searchParams.get('capture') || undefined;

	browserLogger.connection('open', {
		profile: profile || 'temp',
		url: url || undefined,
	});

	// --- onOpen logic (adapted from browser.ts lines 195-561) ---

	const lifecycleManager = BrowserLifecycleManager.getInstance();
	try {
		await lifecycleManager.acquireLock();
	} catch (lockErr) {
		browserLogger.error(
			'lock_timeout',
			lockErr instanceof Error ? lockErr : new Error(String(lockErr)),
			{ profile },
		);
		wsSendJson(ws, { type: 'error', message: 'Browser lock timed out — try reconnecting' });
		ws.close(1011, 'Lock timeout');
		return;
	}

	try {
		// Clean up existing browser instance
		if (activeBrowser) {
			browserLogger.lifecycle('cleanup_existing', { profile: currentProfile || 'unknown' });
			try {
				if (activeInterceptor) {
					await activeInterceptor.detach();
					activeInterceptor = null;
				}
				await activeBrowser.stop();
				browserLogger.lifecycle('cleanup_success', { profile: currentProfile || 'unknown' });
			} catch (cleanupErr) {
				browserLogger.error(
					'cleanup_failed',
					cleanupErr instanceof Error ? cleanupErr : new Error(String(cleanupErr)),
					{ profile: currentProfile },
				);
			}
			activeBrowser = null;
			lifecycleManager.unregisterBrowser();
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		browserReady = false;
		currentProfile = profile || null;
		currentDomain = null;

		// Handle persistent profile
		let userDataDir: string | undefined;
		if (profile) {
			if (!profileExists(profile)) {
				browserLogger.profile('create', profile);
				createProfile(profile);
			}
			const profilePath = getProfilePath(profile);
			if (profilePath) {
				userDataDir = profilePath;
				browserLogger.profile('load', profile, { path: userDataDir });
			}
		}

		activeBrowser = new RemoteBrowserService({
			fps: 1,
			quality: 30,
			viewportWidth: VIEWPORT_WIDTH,
			viewportHeight: VIEWPORT_HEIGHT,
			headless: true,
			userDataDir,
		});

		try {
			browserLogger.lifecycle('starting', { profile: profile || 'temp', userDataDir });

			await activeBrowser.start(
				(frame: FrameData) => {
					// Send binary JPEG frames — ws handles Buffer/Uint8Array natively
					wsSend(ws, frame.bytes as Uint8Array<ArrayBuffer>);
				},
				{
					onError: (error) => {
						browserLogger.error('browser_error', error, { profile });
						wsSendJson(ws, { type: 'error', message: error.message });
					},
					onCrash: (reason) => {
						browserLogger.error('browser_crash', new Error(reason), { profile });
						browserReady = false;
						lifecycleManager.unregisterBrowser();
						wsSendJson(ws, { type: 'crash', reason });
						ws.close(1011, 'Browser crashed');
						activeBrowser = null;
						activeInterceptor = null;
					},
				},
			);

			browserLogger.lifecycle('started', { profile: profile || 'temp' });
			browserReady = true;
			lifecycleManager.registerBrowser(activeBrowser);

			// Attach domain-specific interceptor if config exists
			if (profile) {
				const config = getDomain(profile);
				if (config) {
					currentDomain = config.domainName;
					activePlugin = config;
					browserLogger.debug(`Attaching interceptor for domain: ${config.domainName}`);

					const page = activeBrowser.getPage();
					if (page) {
						activeInterceptor = config.createInterceptor();

						activeInterceptor.onHeadersCaptured = async (headers) => {
							browserLogger.debug(`Headers captured for domain: ${config.domainName}`);
							const manager = GenericSessionManager.getInstance(config.domainName);
							manager.setHeaders(profile, headers);

							if (config.verifyCredentials) {
								browserLogger.debug(`Verifying credentials for domain: ${config.domainName}`);
								const result = await config.verifyCredentials(headers);

								if (result.valid) {
									manager.markVerified(profile, {
										accountNumber: result.accountNumber || '',
										firstName: (result as Record<string, unknown>).firstName as string | undefined,
										lastName: (result as Record<string, unknown>).lastName as string | undefined,
										buyingPower: (result as Record<string, unknown>).buyingPower as
											| string
											| undefined,
									});
									browserLogger.debug(`${config.domainName} VERIFIED: ${JSON.stringify(result)}`);
									const message = config.onVerified
										? config.onVerified(result)
										: { type: `${config.domainName}_verified`, ...result };
									wsSendJson(ws, message);
								} else {
									manager.markVerificationFailed(profile, result.error || 'Unknown error');
									browserLogger.warn(`${config.domainName}_verification_failed`, {
										error: result.error,
									});
									const message = config.onVerificationFailed
										? config.onVerificationFailed(result.error || 'Unknown error')
										: { type: `${config.domainName}_verification_failed`, error: result.error };
									wsSendJson(ws, message);
								}
							}
						};

						// Wire traffic capture
						activeInterceptor.onIntercept((req, res) => {
							addTrafficEntry(req, res);
						});

						await activeInterceptor.attach(page);
						browserLogger.debug(
							`${config.domainName} interceptor attached + traffic capture enabled`,
						);
					}
				}
			}

			// Generic traffic capture via ?capture=domain1.com,domain2.com
			if (captureDomainsParam && activeBrowser) {
				const captureDomains = captureDomainsParam
					.split(',')
					.map((d) => d.trim())
					.filter(Boolean);
				const page = activeBrowser.getPage();
				if (page && captureDomains.length > 0) {
					for (const domain of captureDomains) {
						// Glob pattern: **/*${domain}/** matches both exact and subdomain URLs
						// e.g., "ticketmaster.com" matches https://www.ticketmaster.com/path AND https://api.ticketmaster.com/v2
						const pattern = `**/*${domain}/**`;
						await page.route(pattern, async (route) => {
							const request = route.request();
							const reqUrl = request.url();
							const method = request.method();
							const reqHeaders = request.headers();
							let reqBody: unknown;
							try {
								const postData = request.postData();
								if (postData) reqBody = JSON.parse(postData);
							} catch {
								/* not JSON */
							}

							const interceptedReq: InterceptedRequest = {
								url: reqUrl,
								method,
								headers: reqHeaders,
								body: reqBody,
								timestamp: Date.now(),
							};

							try {
								const response = await route.fetch();
								let resBody: unknown;
								try {
									resBody = await response.json();
								} catch {
									try {
										resBody = await response.text();
									} catch {
										resBody = null;
									}
								}

								const interceptedRes: InterceptedResponse = {
									url: reqUrl,
									status: response.status(),
									headers: response.headers(),
									body: resBody,
									timestamp: Date.now(),
								};

								addTrafficEntry(interceptedReq, interceptedRes);
								await route.fulfill({ response });
							} catch {
								try {
									await route.continue();
								} catch {
									/* page closed */
								}
							}
						});
					}
					browserLogger.debug(`Generic traffic capture enabled for: ${captureDomains.join(', ')}`);
				}
			}

			// URL change tracking + login detection
			let lastUrl: string | null = null;
			let headersCapturedInThisSession = false;

			if (activeInterceptor) {
				const originalCallback = activeInterceptor.onHeadersCaptured;
				activeInterceptor.onHeadersCaptured = async (headers) => {
					headersCapturedInThisSession = true;
					if (originalCallback) await originalCallback(headers);
				};
			}

			activeBrowser.onUrlChange((changedUrl) => {
				wsSendJson(ws, { type: 'url', url: changedUrl });

				if (activePlugin?.detectLoginPage) {
					const isLoginPage = activePlugin.detectLoginPage(changedUrl);
					const wasOnAuthenticatedPage = lastUrl && !activePlugin.detectLoginPage(lastUrl);

					if (isLoginPage && wasOnAuthenticatedPage && headersCapturedInThisSession) {
						const message = activePlugin.onLoginDetected
							? activePlugin.onLoginDetected()
							: { type: `${activePlugin.domainName}_login_page_detected` };
						wsSendJson(ws, message);
					}
				}

				lastUrl = changedUrl;
			});

			wsSendJson(ws, {
				type: 'ready',
				viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
				profile: profile || null,
			});

			// Auto-navigate if URL was provided
			if (url) {
				browserLogger.debug(`Auto-navigating to: ${url}`);
				await activeBrowser.navigate(url);
			}

			browserLogger.connection('ready', { profile: profile || 'temp' });
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			browserLogger.error('start_failed', err instanceof Error ? err : new Error(errorMessage), {
				profile,
			});
			wsSendJson(ws, { type: 'error', message: `Failed to start browser: ${errorMessage}` });
		}
	} finally {
		lifecycleManager.releaseLock();
	}

	// --- onMessage handler ---

	ws.on('message', async (data: Buffer) => {
		if (!activeBrowser || !browserReady) return;

		try {
			const message = JSON.parse(data.toString());

			switch (message.type) {
				case 'navigate':
					if (message.url) await activeBrowser.navigate(message.url);
					break;
				case 'mousemove':
					if (typeof message.x === 'number' && typeof message.y === 'number') {
						await activeBrowser.mouseMove(message.x, message.y);
					}
					break;
				case 'click':
					if (typeof message.x === 'number' && typeof message.y === 'number') {
						await activeBrowser.click(message.x, message.y, message.button || 'left');
					}
					break;
				case 'dblclick':
					if (typeof message.x === 'number' && typeof message.y === 'number') {
						await activeBrowser.doubleClick(message.x, message.y);
					}
					break;
				case 'type':
					if (message.text) await activeBrowser.type(message.text);
					break;
				case 'key':
					if (message.key) await activeBrowser.pressKey(message.key);
					break;
				case 'scroll':
					if (typeof message.x === 'number' && typeof message.y === 'number') {
						await activeBrowser.scroll(
							message.x,
							message.y,
							message.deltaX || 0,
							message.deltaY || 0,
						);
					}
					break;
				case 'paste':
					if (message.text) await activeBrowser.paste(message.text);
					break;
				case 'copy': {
					const text = await activeBrowser.copy();
					wsSendJson(ws, { type: 'clipboard', text });
					break;
				}
				case 'back':
					await activeBrowser.goBack();
					break;
				case 'forward':
					await activeBrowser.goForward();
					break;
				case 'reload':
					await activeBrowser.reload();
					break;
				case 'setFps':
					if (typeof message.fps === 'number') {
						activeBrowser.setFps(message.fps);
						wsSendJson(ws, { type: 'fpsChanged', fps: activeBrowser.getFps() });
					}
					break;
				case 'getFps':
					wsSendJson(ws, { type: 'currentFps', fps: activeBrowser.getFps() });
					break;
				case 'warmup': {
					const sites = typeof message.sites === 'number' ? message.sites : 3;
					const delay = typeof message.delay === 'number' ? message.delay : 2000;
					wsSendJson(ws, { type: 'warmup_started', sites });
					await activeBrowser.warmup(sites, delay);
					wsSendJson(ws, { type: 'warmup_complete' });
					break;
				}
			}
		} catch {
			// Ignore message handling errors
		}
	});

	// --- onClose handler ---

	ws.on('close', async () => {
		browserLogger.connection('close', { profile: currentProfile || 'unknown' });

		const lm = BrowserLifecycleManager.getInstance();
		try {
			await lm.acquireLock();
		} catch {
			// If we can't get the lock, still try to clean up
		}

		try {
			lm.unregisterBrowser();

			if (activeInterceptor) {
				await activeInterceptor.detach();
				activeInterceptor = null;
			}
			if (activeBrowser) {
				browserLogger.lifecycle('stopping', { profile: currentProfile || 'unknown' });
				await activeBrowser.stop();
				browserLogger.lifecycle('stopped', { profile: currentProfile || 'unknown' });
				activeBrowser = null;
			}
			currentProfile = null;
			currentDomain = null;
			activePlugin = undefined;
			browserReady = false;
		} catch (err) {
			browserLogger.error('cleanup_error', err instanceof Error ? err : new Error(String(err)), {
				profile: currentProfile,
			});
		} finally {
			try {
				lm.releaseLock();
			} catch {
				// Lock may not have been acquired
			}
		}
	});
}
