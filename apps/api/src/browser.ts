/**
 * Remote Browser WebSocket API
 *
 * WebSocket endpoint for streaming a remote browser session.
 * Sends binary JPEG frames to clients and receives JSON control messages.
 *
 * Profile Support:
 * - Use `?profile=name` to use a persistent browser profile
 * - Profile 'robinhood-trading' automatically attaches header interceptor
 *
 * Protocol:
 * - Server → Client: Binary JPEG frames + JSON messages
 * - Client → Server: JSON control messages { type: 'navigate' | 'click' | 'mousemove' | 'type' | 'key' | 'scroll' | 'paste' | 'copy', ... }
 *
 * @module api/browser
 */

import {
	BrowserLifecycleManager,
	browserLogger,
	createProfile,
	type FrameData,
	getProfilePath,
	profileExists,
	RemoteBrowserService,
} from "@volat/browser/remote";
import {
	RobinhoodApiClient,
	RobinhoodInterceptor,
	RobinhoodSessionManager,
	type InterceptedRequest,
	type InterceptedResponse,
} from "@volat/browser/robinhood";
import { Hono } from "hono";
import type { UpgradeWebSocket } from "hono/ws";

const VIEWPORT_WIDTH = 1024;
const VIEWPORT_HEIGHT = 576;

/** Robinhood profile name — triggers automatic interceptor attachment */
const ROBINHOOD_PROFILE = "robinhood-trading";

let activeBrowser: RemoteBrowserService | null = null;
let activeInterceptor: RobinhoodInterceptor | null = null;
let browserReady = false;
let currentProfile: string | null = null;

// --- Traffic Capture Buffer ---
// Ring buffer for API traffic captured by interceptors.
// Claude Code polls GET /browser/traffic to read captured request/response pairs.

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
const MAX_BODY_SIZE = 50_000; // characters

let trafficBuffer: TrafficEntry[] = [];
let trafficIdCounter = 0;

function addTrafficEntry(
	req: InterceptedRequest,
	res: InterceptedResponse,
): void {
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

export function createBrowserApp(upgradeWebSocket: UpgradeWebSocket): Hono {
	const app = new Hono();

	// Health endpoint
	app.get("/health", (c) => {
		const lifecycleManager = BrowserLifecycleManager.getInstance();
		const loggerMetrics = browserLogger.getMetrics();
		const managerStatus = lifecycleManager.getStatus();

		return c.json({
			status: "ok",
			browser: {
				active: activeBrowser !== null,
				ready: browserReady,
				profile: currentProfile,
			},
			lifecycle: managerStatus,
			metrics: loggerMetrics,
			timestamp: new Date().toISOString(),
		});
	});

	// Traffic capture endpoints — used by Claude Code for API discovery
	app.get("/traffic", (c) => {
		const since = c.req.query("since");
		let entries = trafficBuffer;
		if (since) {
			const sinceId = Number.parseInt(since, 10);
			if (!Number.isNaN(sinceId)) {
				entries = entries.filter((e) => e.id > sinceId);
			}
		}
		return c.json({
			entries,
			total: trafficBuffer.length,
			oldestId: trafficBuffer[0]?.id ?? 0,
			newestId: trafficBuffer[trafficBuffer.length - 1]?.id ?? 0,
		});
	});

	app.get("/traffic/summary", (c) => {
		const urlPatterns = new Map<string, { count: number; methods: Set<string>; statuses: Set<number> }>();
		for (const entry of trafficBuffer) {
			// Strip IDs/UUIDs from URL to find pattern
			const pattern = entry.url
				.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/{id}")
				.replace(/\/\d+\//g, "/{id}/")
				.replace(/\?.*$/, "");
			const existing = urlPatterns.get(pattern) || { count: 0, methods: new Set(), statuses: new Set() };
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

		return c.json({
			totalEntries: trafficBuffer.length,
			uniqueEndpoints: endpoints.length,
			endpoints: endpoints.sort((a, b) => b.count - a.count),
		});
	});

	app.delete("/traffic", (c) => {
		const count = trafficBuffer.length;
		trafficBuffer = [];
		return c.json({ cleared: count });
	});

	// Browser stream WebSocket
	app.get(
		"/stream",
		upgradeWebSocket((c) => {
			const profile = c.req.query("profile");
			const url = c.req.query("url");
			// Comma-separated domains for generic traffic capture (e.g., ?capture=api.example.com,gateway.example.com)
			const captureDomainsParam = c.req.query("capture");

			return {
				async onOpen(_event, ws) {
					browserLogger.connection("open", {
						profile: profile || "temp",
						url: url || undefined,
					});

					const lifecycleManager = BrowserLifecycleManager.getInstance();
					try {
						await lifecycleManager.acquireLock();
					} catch (lockErr) {
						browserLogger.error(
							"lock_timeout",
							lockErr instanceof Error
								? lockErr
								: new Error(String(lockErr)),
							{ profile },
						);
						try {
							ws.send(
								JSON.stringify({
									type: "error",
									message: "Browser lock timed out — try reconnecting",
								}),
							);
							ws.close(1011, "Lock timeout");
						} catch {
							// Client may have disconnected
						}
						return;
					}

					try {
						// Clean up existing browser instance
						if (activeBrowser) {
							browserLogger.lifecycle("cleanup_existing", {
								profile: currentProfile || "unknown",
							});
							try {
								if (activeInterceptor) {
									await activeInterceptor.detach();
									activeInterceptor = null;
								}
								await activeBrowser.stop();
								browserLogger.lifecycle("cleanup_success", {
									profile: currentProfile || "unknown",
								});
							} catch (cleanupErr) {
								browserLogger.error(
									"cleanup_failed",
									cleanupErr instanceof Error
										? cleanupErr
										: new Error(String(cleanupErr)),
									{ profile: currentProfile },
								);
							}
							activeBrowser = null;
							lifecycleManager.unregisterBrowser();

							// Wait for browser processes to fully terminate
							await new Promise((resolve) => setTimeout(resolve, 500));
						}

						browserReady = false;
						currentProfile = profile || null;

						// Handle persistent profile
						let userDataDir: string | undefined;
						if (profile) {
							if (!profileExists(profile)) {
								browserLogger.profile("create", profile);
								createProfile(profile);
							}
							const profilePath = getProfilePath(profile);
							if (profilePath) {
								userDataDir = profilePath;
								browserLogger.profile("load", profile, {
									path: userDataDir,
								});
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
							browserLogger.lifecycle("starting", {
								profile: profile || "temp",
								userDataDir,
							});

							await activeBrowser.start(
								(frame: FrameData) => {
									try {
										ws.send(
											frame.bytes as Uint8Array<ArrayBuffer>,
										);
									} catch {
										// Client may have disconnected
									}
								},
								{
									onError: (error) => {
										browserLogger.error("browser_error", error, {
											profile,
										});
										try {
											ws.send(
												JSON.stringify({
													type: "error",
													message: error.message,
												}),
											);
										} catch {
											// Client may have disconnected
										}
									},
									onCrash: (reason) => {
										browserLogger.error(
											"browser_crash",
											new Error(reason),
											{ profile },
										);
										browserReady = false;
										lifecycleManager.unregisterBrowser();
										try {
											ws.send(
												JSON.stringify({
													type: "crash",
													reason,
												}),
											);
											ws.close(1011, "Browser crashed");
										} catch {
											// Client may have disconnected
										}
										activeBrowser = null;
										activeInterceptor = null;
									},
								},
							);

							browserLogger.lifecycle("started", {
								profile: profile || "temp",
							});
							browserReady = true;
							lifecycleManager.registerBrowser(activeBrowser);

							// Attach Robinhood interceptor for robinhood-trading profile
							if (profile === ROBINHOOD_PROFILE) {
								browserLogger.debug(
									"Attaching Robinhood interceptor",
								);

								const page = activeBrowser.getPage();
								if (page) {
									activeInterceptor =
										new RobinhoodInterceptor();

									activeInterceptor.onHeadersCaptured =
										async (headers) => {
											browserLogger.debug(
												"Robinhood headers captured",
											);
											const manager =
												RobinhoodSessionManager.getInstance();
											manager.setHeaders(
												ROBINHOOD_PROFILE,
												headers,
											);

											// Verify credentials with a real API call
											browserLogger.debug(
												"Verifying Robinhood credentials",
											);
											const client =
												new RobinhoodApiClient(headers);
											const result =
												await client.verify();

											if (result.valid) {
												manager.markVerified(
													ROBINHOOD_PROFILE,
													{
														accountNumber:
															result.accountNumber ||
															"",
														firstName:
															result.firstName,
														lastName:
															result.lastName,
														buyingPower:
															result.buyingPower,
													},
												);
												browserLogger.debug(
													`Robinhood VERIFIED: Account ${result.accountNumber}, ${result.firstName} ${result.lastName}, Buying Power: $${result.buyingPower}`,
												);

												try {
													ws.send(
														JSON.stringify({
															type: "robinhood_verified",
															accountNumber:
																result.accountNumber,
															firstName:
																result.firstName,
															lastName:
																result.lastName,
															buyingPower:
																result.buyingPower,
														}),
													);
												} catch {
													// Client may have disconnected
												}
											} else {
												manager.markVerificationFailed(
													ROBINHOOD_PROFILE,
													result.error ||
														"Unknown error",
												);
												browserLogger.warn(
													"robinhood_verification_failed",
													{ error: result.error },
												);

												try {
													ws.send(
														JSON.stringify({
															type: "robinhood_verification_failed",
															error: result.error,
														}),
													);
												} catch {
													// Client may have disconnected
												}
											}
										};

									// Wire traffic capture — intercepted req/res pairs go into the buffer
									activeInterceptor.onIntercept(
										(req, res) => {
											addTrafficEntry(req, res);
										},
									);

									await activeInterceptor.attach(page);
									browserLogger.debug(
										"Robinhood interceptor attached + traffic capture enabled",
									);
								}
							}

							// Generic traffic capture for non-Robinhood profiles
							// Use ?capture=api.example.com,gateway.example.com to intercept any domain
							if (captureDomainsParam && activeBrowser) {
								const captureDomains = captureDomainsParam
									.split(",")
									.map((d) => d.trim())
									.filter(Boolean);
								const page = activeBrowser.getPage();
								if (page && captureDomains.length > 0) {
									for (const domain of captureDomains) {
										const pattern = `**/${domain}/**`;
										await page.route(
											pattern,
											async (route) => {
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
											},
										);
									}
									browserLogger.debug(
										`Generic traffic capture enabled for: ${captureDomains.join(", ")}`,
									);
								}
							}

							// URL change tracking + login detection
							let lastUrl: string | null = null;
							let headersCapturedInThisSession = false;

							if (activeInterceptor) {
								const originalCallback =
									activeInterceptor.onHeadersCaptured;
								activeInterceptor.onHeadersCaptured = async (
									headers,
								) => {
									headersCapturedInThisSession = true;
									if (originalCallback)
										await originalCallback(headers);
								};
							}

							activeBrowser.onUrlChange((changedUrl) => {
								try {
									ws.send(
										JSON.stringify({
											type: "url",
											url: changedUrl,
										}),
									);

									if (profile === ROBINHOOD_PROFILE) {
										const isLoginPage =
											changedUrl.includes(
												"robinhood.com/login",
											);
										const wasOnAuthenticatedPage =
											lastUrl &&
											!lastUrl.includes(
												"robinhood.com/login",
											);

										if (
											isLoginPage &&
											wasOnAuthenticatedPage &&
											headersCapturedInThisSession
										) {
											ws.send(
												JSON.stringify({
													type: "robinhood_login_page_detected",
												}),
											);
										}
									}

									lastUrl = changedUrl;
								} catch {
									// Ignore send errors
								}
							});

							ws.send(
								JSON.stringify({
									type: "ready",
									viewport: {
										width: VIEWPORT_WIDTH,
										height: VIEWPORT_HEIGHT,
									},
									profile: profile || null,
								}),
							);

							// Auto-navigate if URL was provided
							if (url) {
								browserLogger.debug(
									`Auto-navigating to: ${url}`,
								);
								await activeBrowser.navigate(url);
							}

							browserLogger.connection("ready", {
								profile: profile || "temp",
							});
						} catch (err) {
							const errorMessage =
								err instanceof Error
									? err.message
									: String(err);
							browserLogger.error(
								"start_failed",
								err instanceof Error
									? err
									: new Error(errorMessage),
								{ profile },
							);
							ws.send(
								JSON.stringify({
									type: "error",
									message: `Failed to start browser: ${errorMessage}`,
								}),
							);
						}
					} finally {
						lifecycleManager.releaseLock();
					}
				},

				async onMessage(event, _ws) {
					if (!activeBrowser || !browserReady) return;

					try {
						const message = JSON.parse(
							event.data.toString(),
						);

						switch (message.type) {
							case "navigate":
								if (message.url) {
									await activeBrowser.navigate(message.url);
								}
								break;

							case "mousemove":
								if (
									typeof message.x === "number" &&
									typeof message.y === "number"
								) {
									await activeBrowser.mouseMove(
										message.x,
										message.y,
									);
								}
								break;

							case "click":
								if (
									typeof message.x === "number" &&
									typeof message.y === "number"
								) {
									await activeBrowser.click(
										message.x,
										message.y,
										message.button || "left",
									);
								}
								break;

							case "dblclick":
								if (
									typeof message.x === "number" &&
									typeof message.y === "number"
								) {
									await activeBrowser.doubleClick(
										message.x,
										message.y,
									);
								}
								break;

							case "type":
								if (message.text) {
									await activeBrowser.type(message.text);
								}
								break;

							case "key":
								if (message.key) {
									await activeBrowser.pressKey(message.key);
								}
								break;

							case "scroll":
								if (
									typeof message.x === "number" &&
									typeof message.y === "number"
								) {
									await activeBrowser.scroll(
										message.x,
										message.y,
										message.deltaX || 0,
										message.deltaY || 0,
									);
								}
								break;

							case "paste":
								if (message.text) {
									await activeBrowser.paste(message.text);
								}
								break;

							case "copy": {
								const text = await activeBrowser.copy();
								_ws.send(
									JSON.stringify({
										type: "clipboard",
										text,
									}),
								);
								break;
							}

							case "back":
								await activeBrowser.goBack();
								break;

							case "forward":
								await activeBrowser.goForward();
								break;

							case "reload":
								await activeBrowser.reload();
								break;

							case "setFps":
								if (typeof message.fps === "number") {
									activeBrowser.setFps(message.fps);
									_ws.send(
										JSON.stringify({
											type: "fpsChanged",
											fps: activeBrowser.getFps(),
										}),
									);
								}
								break;

							case "getFps": {
								const currentFps = activeBrowser.getFps();
								_ws.send(
									JSON.stringify({
										type: "currentFps",
										fps: currentFps,
									}),
								);
								break;
							}

							case "warmup": {
								const sites =
									typeof message.sites === "number"
										? message.sites
										: 3;
								const delay =
									typeof message.delay === "number"
										? message.delay
										: 2000;
								_ws.send(
									JSON.stringify({
										type: "warmup_started",
										sites,
									}),
								);
								await activeBrowser.warmup(sites, delay);
								_ws.send(
									JSON.stringify({
										type: "warmup_complete",
									}),
								);
								break;
							}
						}
					} catch {
						// Ignore message handling errors
					}
				},

				async onClose() {
					browserLogger.connection("close", {
						profile: currentProfile || "unknown",
					});
					const lifecycleManager =
						BrowserLifecycleManager.getInstance();
					await lifecycleManager.acquireLock();
					try {
						lifecycleManager.unregisterBrowser();

						if (activeInterceptor) {
							await activeInterceptor.detach();
							activeInterceptor = null;
						}
						if (activeBrowser) {
							browserLogger.lifecycle("stopping", {
								profile: currentProfile || "unknown",
							});
							await activeBrowser.stop();
							browserLogger.lifecycle("stopped", {
								profile: currentProfile || "unknown",
							});
							activeBrowser = null;
						}
						currentProfile = null;
					} finally {
						lifecycleManager.releaseLock();
					}
				},

				onError() {
					// Connection error
				},
			};
		}),
	);

	return app;
}
