/**
 * Remote Browser Streaming Service
 *
 * Provides screenshot-based streaming of a Patchright browser session.
 * Uses Patchright's native methods for input handling.
 *
 * Anti-detection (Patchright best practices):
 * - Uses Chromium browser for ARM64 compatibility
 * - Uses launchPersistentContext for better fingerprinting
 * - Consistent Mac User-Agent and fingerprint across all platforms
 * - headless: false for best bypass (new headless mode still detectable)
 * - Blocks fingerprinting/tracking scripts (FingerprintJS, Segment, etc.)
 *
 * @module browser/remote
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, CDPSession, Page, Route } from 'patchright';
import { chromium } from 'patchright';
import { BlockerManager } from '../blocker';

/**
 * URLs to block completely (tracking, analytics, fingerprinting)
 * These are Robinhood-specific trackers that can detect automation
 */
const BLOCKED_TRACKING_URLS = [
	// Fingerprinting / device detection - CRITICAL for bot detection
	'**/fingerprintjs.com/**',
	'**/fpjs.io/**',
	'**/cdn.fingerprint.com/**',
	'**/fp.robinhood.com/**',
	'**/arkoselabs.com/**',
	'**/funcaptcha.com/**',

	// Analytics & tracking
	'**/segment.io/**',
	'**/segment.com/**',
	'**/analytics.robinhood.com/**',
	'**/cdn.segment.com/**',
	'**/api.segment.io/**',

	// Marketing / attribution
	'**/branch.io/**',
	'**/app.link/**',
	'**/bnc.lt/**',
	'**/adjust.com/**',
	'**/appsflyer.com/**',

	// Error tracking (can leak automation info)
	'**/sentry.io/**',
	'**/bugsnag.com/**',

	// Google analytics
	'**/google-analytics.com/**',
	'**/googletagmanager.com/**',
	'**/gtag/**',

	// Facebook pixel
	'**/facebook.com/tr/**',
	'**/connect.facebook.net/**',

	// Other trackers
	'**/doubleclick.net/**',
	'**/hotjar.com/**',
	'**/fullstory.com/**',
	'**/heap.io/**',
	'**/amplitude.com/**',
	'**/mixpanel.com/**',
	'**/optimizely.com/**',
	'**/launchdarkly.com/**',
];

export interface StreamConfig {
	/** Frames per second (default: 4) */
	fps?: number;
	/** JPEG quality 0-100 (default: 70) */
	quality?: number;
	/** Viewport width (default: 1280) */
	viewportWidth?: number;
	/** Viewport height (default: 720) */
	viewportHeight?: number;
	/** Run browser in headless mode - WARNING: easier to detect (default: false) */
	headless?: boolean;
	/** Enable Ghostery ad/tracker blocking (default: true) */
	enableAdBlocking?: boolean;
	/** Custom user data directory for persistent profiles (default: temp) */
	userDataDir?: string;
	/**
	 * Proxy type to use for connections.
	 * - 'none': Direct connection (default)
	 * - 'datacenter': Bright Data datacenter proxy (cheaper, faster, more detectable)
	 * - 'residential': Bright Data residential proxy (more expensive, slower, less detectable)
	 */
	proxyType?: 'none' | 'datacenter' | 'residential';
}

export interface FrameData {
	/** Frame sequence number */
	frameId: number;
	/** JPEG image bytes */
	bytes: Uint8Array;
	/** Capture timestamp */
	timestamp: number;
}

export type FrameCallback = (frame: FrameData) => void;
export type ErrorCallback = (error: Error) => void;
export type CrashCallback = (reason: string) => void;

const DEFAULT_CONFIG: Omit<Required<StreamConfig>, 'userDataDir'> & { userDataDir?: string } = {
	fps: 1,
	quality: 30,
	viewportWidth: 1024,
	viewportHeight: 576,
	headless: false,
	enableAdBlocking: true,
	userDataDir: undefined,
	proxyType: 'none',
};

/** Full config type with optional userDataDir */
type FullConfig = Required<Omit<StreamConfig, 'userDataDir'>> & { userDataDir?: string };

/**
 * Remote browser streaming service using Patchright.
 */
export class RemoteBrowserService {
	private config: FullConfig;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private cdp: CDPSession | null = null;
	private frameCallback: FrameCallback | null = null;
	private urlChangeCallback: ((url: string) => void) | null = null;
	private errorCallback: ErrorCallback | null = null;
	private crashCallback: CrashCallback | null = null;
	private frameId = 0;
	private isRunning = false;
	private userDataDir: string | null = null;
	private interceptors: Map<string, (route: Route) => Promise<void>> = new Map();

	/** Callback for CDP-captured network traffic (XHR/Fetch JSON responses) */
	private networkCaptureCallback:
		| ((
				req: { method: string; url: string; body: unknown; headers: Record<string, string> },
				res: { url: string; status: number; headers: Record<string, string>; body: unknown },
		  ) => void)
		| null = null;

	// Frame throttling state (double-buffer pattern)
	private lastFrameSentAt = 0;
	private pendingFrame: FrameData | null = null;
	private frameIntervalMs: number;

	constructor(config: StreamConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config } as FullConfig;
		// Calculate frame interval from FPS (e.g., 1 FPS = 1000ms interval)
		this.frameIntervalMs = Math.floor(1000 / this.config.fps);
	}

	/**
	 * Get proxy configuration based on proxyType setting.
	 * Parses Bright Data proxy URLs from environment variables.
	 *
	 * URL format: http://username:password@host:port
	 * - BRIGHTDATA_PROXY_URL: Datacenter proxy (cheaper, faster, more detectable)
	 * - BRIGHTDATA_RESIDENTIAL_URL: Residential proxy (expensive, slower, less detectable)
	 */
	private getProxyConfig(): { server: string; username: string; password: string } | null {
		if (this.config.proxyType === 'none') {
			return null;
		}

		const proxyUrl =
			this.config.proxyType === 'datacenter'
				? process.env.BRIGHTDATA_PROXY_URL
				: process.env.BRIGHTDATA_RESIDENTIAL_URL;

		if (!proxyUrl) {
			console.warn(
				`[RemoteBrowserService] No proxy URL found for type '${this.config.proxyType}'. ` +
					`Set BRIGHTDATA_PROXY_URL or BRIGHTDATA_RESIDENTIAL_URL in .env`,
			);
			return null;
		}

		try {
			// Parse URL format: http://username:password@host:port
			const url = new URL(proxyUrl);
			return {
				server: `${url.protocol}//${url.host}`,
				username: decodeURIComponent(url.username),
				password: decodeURIComponent(url.password),
			};
		} catch (error) {
			console.error(`[RemoteBrowserService] Failed to parse proxy URL: ${error}`);
			return null;
		}
	}

	/**
	 * Get the viewport dimensions for coordinate mapping on the client.
	 */
	getViewport(): { width: number; height: number } {
		return {
			width: this.config.viewportWidth,
			height: this.config.viewportHeight,
		};
	}

	/**
	 * Get the current FPS setting.
	 */
	getFps(): number {
		return this.config.fps;
	}

	/**
	 * Dynamically change the frame rate.
	 * Uses double-buffer pattern: only the latest frame is sent at the target rate.
	 * @param fps - Target frames per second (0.5 to 30)
	 */
	setFps(fps: number): void {
		const clampedFps = Math.max(0.5, Math.min(30, fps));
		this.config.fps = clampedFps;
		this.frameIntervalMs = Math.floor(1000 / clampedFps);
		console.log(
			`[RemoteBrowserService] FPS changed to ${clampedFps} (interval: ${this.frameIntervalMs}ms)`,
		);
	}

	/**
	 * Get the current page instance for direct manipulation.
	 * Useful for attaching interceptors or running custom scripts.
	 */
	getPage(): Page | null {
		return this.page;
	}

	/**
	 * Check if the browser is currently running.
	 */
	getIsRunning(): boolean {
		return this.isRunning;
	}

	/**
	 * Register a route interceptor for capturing/modifying requests.
	 * @param pattern - URL glob pattern to intercept (e.g., '**\/api.robinhood.com\/**')
	 * @param handler - Async handler function that receives the Route
	 */
	async addInterceptor(pattern: string, handler: (route: Route) => Promise<void>): Promise<void> {
		if (!this.page) {
			throw new Error('Browser not started - cannot add interceptor');
		}
		if (this.interceptors.has(pattern)) {
			console.log(`[RemoteBrowserService.addInterceptor] Pattern already registered: ${pattern}`);
			return;
		}
		await this.page.route(pattern, handler);
		this.interceptors.set(pattern, handler);
		console.log(`[RemoteBrowserService.addInterceptor] Registered interceptor for: ${pattern}`);
	}

	/**
	 * Remove a previously registered route interceptor.
	 */
	async removeInterceptor(pattern: string): Promise<void> {
		if (!this.page) return;
		if (!this.interceptors.has(pattern)) return;

		await this.page.unroute(pattern);
		this.interceptors.delete(pattern);
		console.log(`[RemoteBrowserService.removeInterceptor] Removed interceptor for: ${pattern}`);
	}

	/**
	 * Remove all registered interceptors.
	 */
	async clearInterceptors(): Promise<void> {
		if (!this.page) return;

		for (const pattern of this.interceptors.keys()) {
			await this.page.unroute(pattern);
		}
		this.interceptors.clear();
		console.log('[RemoteBrowserService.clearInterceptors] Cleared all interceptors');
	}

	/**
	 * Start the browser and begin streaming frames.
	 */
	async start(
		onFrame: FrameCallback,
		options?: { onError?: ErrorCallback; onCrash?: CrashCallback },
	): Promise<void> {
		if (this.isRunning) {
			console.log('[RemoteBrowserService.start] Already running, skipping start');
			return;
		}

		console.log('[RemoteBrowserService.start] Starting browser...');
		this.frameCallback = onFrame;
		this.errorCallback = options?.onError ?? null;
		this.crashCallback = options?.onCrash ?? null;
		this.isRunning = true;

		try {
			await this.launchBrowser();
			console.log('[RemoteBrowserService.start] Browser started successfully');
		} catch (err) {
			console.error('[RemoteBrowserService.start] Failed to start browser:', err);
			// Reset state so we can try again
			this.isRunning = false;
			this.context = null;
			this.page = null;
			this.cdp = null;
			this.frameCallback = null;
			this.errorCallback = null;
			this.crashCallback = null;
			throw err;
		}
	}

	/**
	 * Internal method to launch browser - separated for error handling.
	 */
	private async launchBrowser(): Promise<void> {
		// Use provided userDataDir (persistent profile) or create temp
		if (this.config.userDataDir) {
			this.userDataDir = this.config.userDataDir;
		} else {
			this.userDataDir = mkdtempSync(join(tmpdir(), 'patchright-'));
		}

		const commonArgs = [
			'--disable-infobars',
			'--disable-blink-features=AutomationControlled',
			'--disable-background-timer-throttling',
			'--disable-backgrounding-occluded-windows',
			'--disable-renderer-backgrounding',
		];

		// When using a persistent Chrome user data dir, force the Default profile.
		// Without this, Chromium can sometimes spin up a fresh profile with empty cookies/storage.
		if (this.config.userDataDir) {
			commonArgs.push('--profile-directory=Default');
			commonArgs.push('--no-first-run');
			commonArgs.push('--no-default-browser-check');
		}

		// Use system chromium if CHROMIUM_PATH is set (Docker), otherwise use Patchright's bundled browser
		const executablePath = process.env.CHROMIUM_PATH || undefined;

		// Use consistent Mac User-Agent across all platforms to avoid bot detection
		// Chrome 145 — matches real Chrome binary version and sec-ch-ua override below.
		// Version mismatch between UA and sec-ch-ua is a bot detection signal.
		const MAC_USER_AGENT =
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

		// Anti-detection: Comprehensive script to override navigator properties BEFORE any page JS runs
		// This must match the macOS fingerprint as closely as possible
		const antiDetectionScript = `
			// === Core Navigator Overrides ===
			Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
			Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
			Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
			Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
			Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
			Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 }); // Typical Mac
			Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 }); // 8GB typical
			Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 }); // Desktop Mac has no touch

			// === Plugins - macOS Chrome has these ===
			const fakePlugins = {
				0: { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				1: { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				2: { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				3: { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				4: { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
				length: 5,
				item: function(i) { return this[i] || null; },
				namedItem: function(name) { return Object.values(this).find(p => p && p.name === name) || null; },
				refresh: function() {},
				[Symbol.iterator]: function*() { for (let i = 0; i < this.length; i++) yield this[i]; }
			};
			Object.defineProperty(navigator, 'plugins', { get: () => fakePlugins });

			// === WebGL - Critical for fingerprinting ===
			const getParameterProxyHandler = {
				apply: function(target, thisArg, args) {
					const param = args[0];
					// UNMASKED_VENDOR_WEBGL
					if (param === 37445) return 'Apple Inc.';
					// UNMASKED_RENDERER_WEBGL  
					if (param === 37446) return 'Apple M1';
					// VERSION
					if (param === 7938) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
					// SHADING_LANGUAGE_VERSION
					if (param === 35724) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
					return Reflect.apply(target, thisArg, args);
				}
			};
			
			// Wrap WebGL getParameter for all canvas contexts
			const originalGetContext = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function(type, ...args) {
				const context = originalGetContext.apply(this, [type, ...args]);
				if (context && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
					context.getParameter = new Proxy(context.getParameter, getParameterProxyHandler);
				}
				return context;
			};

			// Also wrap OffscreenCanvas if available
			if (typeof OffscreenCanvas !== 'undefined') {
				const originalOffscreenGetContext = OffscreenCanvas.prototype.getContext;
				OffscreenCanvas.prototype.getContext = function(type, ...args) {
					const context = originalOffscreenGetContext.apply(this, [type, ...args]);
					if (context && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
						context.getParameter = new Proxy(context.getParameter, getParameterProxyHandler);
					}
					return context;
				};
			}

			// === Screen properties - Match typical Mac display ===
			Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
			Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });

			// === AudioContext fingerprinting protection ===
			const originalAudioContext = window.AudioContext || window.webkitAudioContext;
			if (originalAudioContext) {
				window.AudioContext = window.webkitAudioContext = class extends originalAudioContext {
					constructor(...args) {
						super(...args);
						// Override sampleRate to macOS default
						Object.defineProperty(this, 'sampleRate', { get: () => 44100 });
					}
				};
			}

			// === Battery API - Return null (macOS Chrome doesn't expose this) ===
			if (navigator.getBattery) {
				navigator.getBattery = undefined;
			}

			// === Connection API - Spoof to typical desktop ===
			if (navigator.connection) {
				Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
				Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
				Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
			}

			// === Permissions API - Don't reveal automation ===
			const originalQuery = navigator.permissions?.query;
			if (originalQuery) {
				navigator.permissions.query = function(parameters) {
					// Notifications typically denied by default on Mac
					if (parameters.name === 'notifications') {
						return Promise.resolve({ state: 'denied', onchange: null });
					}
					return originalQuery.call(this, parameters);
				};
			}
		`;

		// Configure proxy based on proxyType setting
		// Bright Data proxy URLs from environment variables
		const proxyConfig = this.getProxyConfig();
		if (proxyConfig) {
			console.log(
				`[RemoteBrowserService] Using ${this.config.proxyType} proxy: ${proxyConfig.server}`,
			);
		} else {
			console.log('[RemoteBrowserService] No proxy configured (direct connection)');
		}

		this.context = await chromium.launchPersistentContext(this.userDataDir, {
			...(executablePath && { executablePath }),
			headless: this.config.headless,
			viewport: {
				width: this.config.viewportWidth,
				height: this.config.viewportHeight,
			},
			deviceScaleFactor: 1, // Force 1x scale for consistent streaming
			userAgent: MAC_USER_AGENT,
			locale: 'en-US',
			timezoneId: 'America/New_York',
			args: commonArgs,
			// Add proxy config if specified
			...(proxyConfig && { proxy: proxyConfig }),
			// Ignore HTTPS errors when using residential proxies (they use MITM for SSL)
			ignoreHTTPSErrors: this.config.proxyType === 'residential',
		});

		// Override sec-ch-ua to prevent HeadlessChrome detection.
		// When Patchright runs in headless mode, Chromium automatically sets
		// sec-ch-ua to include "HeadlessChrome" — a primary Cloudflare Bot Management
		// detection signal. Sites like Yahoo Finance allow CDN-cached endpoints through
		// but block real-time data endpoints (quotes, prices) when HeadlessChrome is detected.
		// setExtraHTTPHeaders overrides browser-generated headers for ALL requests from this context,
		// including JavaScript-initiated fetch() calls via page.evaluate().
		// The value must match MAC_USER_AGENT version (Chrome 145) to avoid version-mismatch detection.
		// When using real Chrome channel, sec-ch-ua is already correct — this is defense-in-depth.
		await this.context.setExtraHTTPHeaders({
			'sec-ch-ua': '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"',
			'sec-ch-ua-mobile': '?0',
			'sec-ch-ua-platform': '"macOS"',
		});

		// Add anti-detection script BEFORE getting/creating pages
		await this.context.addInitScript(antiDetectionScript);

		const pages = this.context.pages();
		this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

		// Also add init script to the page level for existing pages from persistent context
		// Context-level addInitScript only applies to pages created AFTER the call
		await this.page.addInitScript(antiDetectionScript);

		// Block fingerprinting and tracking URLs at the route level
		// This runs BEFORE Ghostery and catches Robinhood-specific trackers
		for (const pattern of BLOCKED_TRACKING_URLS) {
			await this.context.route(pattern, (route) => route.abort());
		}

		// Enable Ghostery ad/tracker blocking (general ad blocking)
		if (this.config.enableAdBlocking) {
			const blockerManager = BlockerManager.getInstance();
			await blockerManager.enableBlockingSilent(this.page);
		}

		this.context.on('page', async (newPage) => {
			// Enable ad blocking on new pages too
			if (this.config.enableAdBlocking) {
				const blockerManager = BlockerManager.getInstance();
				await blockerManager.enableBlockingSilent(newPage);
			}
			try {
				await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 });
			} catch {
				// Timeout is fine
			}
			await this.switchPage(newPage);
		});

		this.context.on('close', () => {
			this.handleCrash('Browser context closed');
		});

		this.page.on('crash', () => {
			this.handleCrash('Page crashed');
		});

		this.page.on('close', () => {
			if (this.isRunning && this.context) {
				const pages = this.context.pages();
				if (pages.length > 0) {
					void this.switchPage(pages[0]);
				} else {
					this.handleCrash('All pages closed');
				}
			}
		});

		// Navigate to a real page to trigger init scripts (about:blank doesn't run them)
		// We use data URL which is fast and triggers init script execution
		await this.page.goto('data:text/html,<html></html>');

		// Log browser fingerprint data for debugging bot detection issues
		await this.logBrowserFingerprint();

		await this.startScreencast();
	}

	/**
	 * Log key browser fingerprint data for debugging bot detection.
	 * Only logs once on browser start - not on every page load.
	 */
	private async logBrowserFingerprint(): Promise<void> {
		if (!this.page) return;

		try {
			const fingerprint = await this.page.evaluate(() => {
				return {
					userAgent: navigator.userAgent,
					platform: navigator.platform,
					vendor: navigator.vendor,
					language: navigator.language,
					languages: navigator.languages,
					hardwareConcurrency: navigator.hardwareConcurrency,
					deviceMemory: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
					maxTouchPoints: navigator.maxTouchPoints,
					webdriver: (navigator as unknown as { webdriver?: boolean }).webdriver,
					// Screen info
					screenWidth: screen.width,
					screenHeight: screen.height,
					screenColorDepth: screen.colorDepth,
					devicePixelRatio: window.devicePixelRatio,
					// Timezone
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					timezoneOffset: new Date().getTimezoneOffset(),
					// WebGL (key for bot detection)
					webglVendor: (() => {
						try {
							const canvas = document.createElement('canvas');
							const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
							if (gl) {
								const debugInfo = (gl as WebGLRenderingContext).getExtension(
									'WEBGL_debug_renderer_info',
								);
								if (debugInfo) {
									return (gl as WebGLRenderingContext).getParameter(
										debugInfo.UNMASKED_VENDOR_WEBGL,
									);
								}
							}
						} catch {
							/* ignore */
						}
						return 'unknown';
					})(),
					webglRenderer: (() => {
						try {
							const canvas = document.createElement('canvas');
							const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
							if (gl) {
								const debugInfo = (gl as WebGLRenderingContext).getExtension(
									'WEBGL_debug_renderer_info',
								);
								if (debugInfo) {
									return (gl as WebGLRenderingContext).getParameter(
										debugInfo.UNMASKED_RENDERER_WEBGL,
									);
								}
							}
						} catch {
							/* ignore */
						}
						return 'unknown';
					})(),
				};
			});

			// Import logger dynamically to avoid circular deps
			const { browserLogger } = await import('./logger');
			browserLogger.lifecycle('fingerprint', {
				...fingerprint,
				nodeEnv: process.env.NODE_ENV,
				chromiumPath: process.env.CHROMIUM_PATH || 'bundled',
			});
		} catch (err) {
			// Don't fail browser start if fingerprint logging fails
			console.warn('[RemoteBrowserService] Failed to log fingerprint:', err);
		}
	}

	/**
	 * Sites to visit during warmup to build browsing history.
	 * These are popular sites that a real user might visit, helping avoid bot detection.
	 */
	private static readonly WARMUP_SITES = [
		'https://www.google.com',
		'https://www.wikipedia.org',
		'https://www.weather.com',
		'https://news.ycombinator.com',
		'https://www.reddit.com',
	];

	/**
	 * Warm up the browser by visiting common sites to build history.
	 * This helps avoid bot detection by making the browser look more like a real user's.
	 *
	 * @param sitesToVisit - Number of sites to visit (default: 3)
	 * @param delayMs - Delay between sites in milliseconds (default: 2000)
	 * @returns Promise that resolves when warmup is complete
	 */
	async warmup(sitesToVisit = 3, delayMs = 2000): Promise<void> {
		if (!this.page) {
			throw new Error('Browser not started - cannot warmup');
		}

		console.log(`[RemoteBrowserService.warmup] Visiting ${sitesToVisit} sites to build history...`);

		const sites = RemoteBrowserService.WARMUP_SITES.slice(0, sitesToVisit);

		for (const site of sites) {
			try {
				console.log(`[RemoteBrowserService.warmup] Visiting ${site}...`);
				await this.page.goto(site, { waitUntil: 'domcontentloaded', timeout: 15000 });

				// Simulate some browsing behavior - scroll a bit
				await this.page.evaluate(() => {
					window.scrollBy(0, Math.random() * 300 + 100);
				});

				// Random delay between sites (adds human-like variation)
				const actualDelay = delayMs + Math.random() * 1000;
				await new Promise((resolve) => setTimeout(resolve, actualDelay));
			} catch (err) {
				// Don't fail warmup if a site doesn't load
				console.warn(`[RemoteBrowserService.warmup] Failed to load ${site}:`, err);
			}
		}

		console.log('[RemoteBrowserService.warmup] Warmup complete');
	}

	/**
	 * Stop streaming and close the browser.
	 * Performs aggressive cleanup to ensure all browser processes are terminated.
	 */
	async stop(): Promise<void> {
		console.log('[RemoteBrowserService.stop] Stopping browser...');
		this.isRunning = false;

		await this.stopScreencast();

		// Clear CDP session first
		if (this.cdp) {
			try {
				await this.cdp.detach();
			} catch {
				// CDP may already be detached
			}
			this.cdp = null;
		}

		// Close all pages first
		if (this.context) {
			try {
				const pages = this.context.pages();
				console.log(`[RemoteBrowserService.stop] Closing ${pages.length} pages...`);
				for (const page of pages) {
					try {
						await page.close();
					} catch {
						// Page may already be closed
					}
				}
			} catch {
				// Context may be in bad state
			}
		}

		// Close the context (this should terminate the browser process)
		if (this.context) {
			try {
				console.log('[RemoteBrowserService.stop] Closing browser context...');
				await this.context.close();
				console.log('[RemoteBrowserService.stop] Browser context closed');
			} catch (err) {
				console.error('[RemoteBrowserService.stop] Error closing context:', err);
			}
			this.context = null;
			this.page = null;
		}

		this.frameCallback = null;
		this.errorCallback = null;
		this.crashCallback = null;
		this.urlChangeCallback = null;
		this.interceptors.clear();

		console.log('[RemoteBrowserService.stop] Browser stopped');
	}

	/**
	 * Navigate to a URL.
	 */
	async navigate(url: string): Promise<void> {
		this.assertPageAvailable();
		try {
			await this.page?.goto(url, { waitUntil: 'commit', timeout: 10000 });
		} catch (err) {
			this.handleOperationError('navigate', err);
		}
	}

	/**
	 * Move mouse to coordinates.
	 */
	async mouseMove(x: number, y: number): Promise<void> {
		if (!this.page) return;

		const clampedX = Math.max(0, Math.min(x, this.config.viewportWidth));
		const clampedY = Math.max(0, Math.min(y, this.config.viewportHeight));

		try {
			await this.page.mouse.move(clampedX, clampedY);
		} catch {
			// Mouse move errors are usually transient
		}
	}

	/**
	 * Click at coordinates.
	 */
	async click(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
		if (!this.page) return;

		const clampedX = Math.max(0, Math.min(x, this.config.viewportWidth));
		const clampedY = Math.max(0, Math.min(y, this.config.viewportHeight));

		try {
			const linkInfo = await this.page.evaluate(
				({ x, y }) => {
					const element = document.elementFromPoint(x, y);
					if (!element) return null;
					const anchor = element.closest('a');
					if (!anchor) return null;
					return {
						href: anchor.href,
						target: anchor.target,
					};
				},
				{ x: clampedX, y: clampedY },
			);

			if (linkInfo?.href && linkInfo.target === '_blank') {
				await this.page.goto(linkInfo.href, { waitUntil: 'commit', timeout: 10000 });
				return;
			}

			await this.page.mouse.click(clampedX, clampedY, { button });
		} catch (err) {
			this.handleOperationError('click', err);
		}
	}

	/**
	 * Double-click at coordinates.
	 */
	async doubleClick(x: number, y: number): Promise<void> {
		if (!this.page) return;

		const clampedX = Math.max(0, Math.min(x, this.config.viewportWidth));
		const clampedY = Math.max(0, Math.min(y, this.config.viewportHeight));

		try {
			await this.page.mouse.dblclick(clampedX, clampedY);
		} catch (err) {
			this.handleOperationError('doubleClick', err);
		}
	}

	/**
	 * Scroll using wheel event.
	 */
	async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
		if (!this.page) return;

		try {
			await this.page.mouse.move(x, y);
			await this.page.mouse.wheel(deltaX, deltaY);
		} catch {
			// Scroll errors are usually transient
		}
	}

	/**
	 * Type text.
	 */
	async type(text: string): Promise<void> {
		if (!this.page) return;

		try {
			await this.page.keyboard.type(text);
		} catch (err) {
			this.handleOperationError('type', err);
		}
	}

	/**
	 * Press a special key.
	 */
	async pressKey(key: string): Promise<void> {
		if (!this.page) return;

		try {
			await this.page.keyboard.press(key);
		} catch (err) {
			this.handleOperationError('pressKey', err);
		}
	}

	/**
	 * Paste text from clipboard.
	 * Inserts the text directly using keyboard.insertText() which bypasses
	 * normal keyboard events and works like a paste operation.
	 */
	async paste(text: string): Promise<void> {
		if (!this.page) return;

		try {
			await this.page.keyboard.insertText(text);
		} catch (err) {
			this.handleOperationError('paste', err);
		}
	}

	/**
	 * Copy selected text from the page.
	 * Returns the selected text, or empty string if nothing selected.
	 */
	async copy(): Promise<string> {
		if (!this.page) return '';

		try {
			const selectedText = await this.page.evaluate(() => {
				return window.getSelection()?.toString() ?? '';
			});
			return selectedText;
		} catch {
			return '';
		}
	}

	/**
	 * Go back in browser history.
	 */
	async goBack(): Promise<void> {
		if (!this.page) return;
		try {
			await this.page.goBack({ waitUntil: 'commit', timeout: 10000 });
		} catch (err) {
			this.handleOperationError('goBack', err);
		}
	}

	/**
	 * Go forward in browser history.
	 */
	async goForward(): Promise<void> {
		if (!this.page) return;
		try {
			await this.page.goForward({ waitUntil: 'commit', timeout: 10000 });
		} catch (err) {
			this.handleOperationError('goForward', err);
		}
	}

	/**
	 * Reload the current page.
	 */
	async reload(): Promise<void> {
		if (!this.page) return;
		try {
			await this.page.reload({ waitUntil: 'commit', timeout: 10000 });
		} catch (err) {
			this.handleOperationError('reload', err);
		}
	}

	/**
	 * Execute a fetch request through the browser context.
	 * This uses the browser's cookies, session, and authentication.
	 *
	 * Default behavior: navigates to the target API origin if not already there, then fetches.
	 * This ensures cookies and session state are included.
	 *
	 * Use `navigateTo` when the API is on a subdomain that allows CORS from the main site.
	 * Example: Yahoo Finance serves APIs on query2.finance.yahoo.com but allows CORS from
	 * finance.yahoo.com. Navigating to the API subdomain first loses the main site session
	 * and may hit rate limits. Instead, pass `navigateTo: 'https://finance.yahoo.com'` so
	 * the browser stays on the main site and makes a credentialed cross-origin fetch.
	 *
	 * @param url - The URL to fetch
	 * @param options.navigateTo - Override the origin to navigate to before fetching.
	 *   Use when the API subdomain has CORS enabled from the main site (any cross-domain API).
	 * @returns The response data
	 */
	async browserFetch<T = unknown>(
		url: string,
		options: {
			method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
			headers?: Record<string, string>;
			body?: unknown;
			/** Navigate to this origin before fetching instead of the target API origin.
			 *  Use for cross-origin APIs where the main site has CORS access. */
			navigateTo?: string;
		} = {},
	): Promise<{ status: number; data: T; headers: Record<string, string> }> {
		if (!this.page) {
			throw new Error('Browser not started');
		}

		// Extract the origin from the target URL
		const targetOrigin = new URL(url).origin;
		const currentUrl = this.page.url();
		const currentOrigin = currentUrl ? new URL(currentUrl).origin : '';

		// Determine navigation target: use navigateTo override if provided,
		// otherwise default to the target API origin.
		// navigateTo is used when the API subdomain has CORS enabled from the main site —
		// staying on the main site avoids navigating to a raw API endpoint that may 429
		// or lack the session context needed for credentialed requests.
		const navigationOrigin = options.navigateTo
			? new URL(options.navigateTo).origin
			: targetOrigin;

		// Navigate to the target origin if we're not already there
		if (currentOrigin !== navigationOrigin) {
			try {
				// Navigate to a lightweight page on the target origin
				await this.page.goto(navigationOrigin, { waitUntil: 'domcontentloaded', timeout: 15000 });
			} catch (_err) {
				// If navigation fails, try anyway - the fetch might still work
			}
		}

		const result = await this.page.evaluate(
			async ({ url, options }) => {
				try {
					const fetchOptions: RequestInit = {
						method: options.method || 'GET',
						headers: {
							Accept: 'application/json',
							'Content-Type': 'application/json',
							...options.headers,
						},
						credentials: 'include', // Include cookies
					};

					if (options.body) {
						fetchOptions.body = JSON.stringify(options.body);
					}

					const response = await fetch(url, fetchOptions);

					// Collect response headers
					const responseHeaders: Record<string, string> = {};
					response.headers.forEach((value, key) => {
						responseHeaders[key] = value;
					});

					// Try to parse as JSON, fall back to text
					let data: unknown;
					const contentType = response.headers.get('content-type') || '';
					if (contentType.includes('application/json')) {
						data = await response.json();
					} else {
						data = await response.text();
					}

					return {
						success: true as const,
						status: response.status,
						data,
						headers: responseHeaders,
					};
				} catch (error) {
					return {
						success: false as const,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
			{ url, options },
		);

		if (!result.success) {
			throw new Error(result.error);
		}

		return {
			status: result.status,
			data: result.data as T,
			headers: result.headers,
		};
	}

	/**
	 * Get the current page URL.
	 */
	getUrl(): string {
		return this.page?.url() ?? '';
	}

	/**
	 * Register a callback for URL changes.
	 */
	onUrlChange(callback: (url: string) => void): void {
		this.urlChangeCallback = callback;
		if (!this.page) return;

		callback(this.page.url());

		this.page.on('framenavigated', (frame) => {
			if (frame === this.page?.mainFrame()) {
				callback(this.page.url());
			}
		});
	}

	/**
	 * Register a callback to receive captured network traffic.
	 * CDP captures ALL XHR/Fetch requests with JSON responses.
	 */
	onNetworkCapture(
		callback: (
			req: { method: string; url: string; body: unknown; headers: Record<string, string> },
			res: { url: string; status: number; headers: Record<string, string>; body: unknown },
		) => void,
	): void {
		this.networkCaptureCallback = callback;
	}

	/**
	 * Set up CDP Network event handlers for traffic capture.
	 */
	private setupNetworkCapture(): void {
		if (!this.cdp) return;

		const pendingRequests = new Map<
			string,
			{
				method: string;
				url: string;
				body: unknown;
				headers: Record<string, string>;
				timestamp: number;
			}
		>();
		const responseInfo = new Map<
			string,
			{ url: string; status: number; headers: Record<string, string>; contentType: string }
		>();

		this.cdp.on('Network.requestWillBeSent', (params: any) => {
			if (!['XHR', 'Fetch'].includes(params.type)) return;
			let body: unknown;
			try {
				if (params.request.postData) body = JSON.parse(params.request.postData);
			} catch {
				body = params.request.postData || null;
			}
			pendingRequests.set(params.requestId, {
				method: params.request.method,
				url: params.request.url,
				body,
				headers: params.request.headers,
				timestamp: Date.now(),
			});
		});

		this.cdp.on('Network.responseReceived', (params: any) => {
			if (!pendingRequests.has(params.requestId)) return;
			const ct =
				params.response.headers['content-type'] || params.response.headers['Content-Type'] || '';
			responseInfo.set(params.requestId, {
				url: params.response.url,
				status: params.response.status,
				headers: params.response.headers,
				contentType: ct,
			});
		});

		this.cdp.on('Network.loadingFinished', async (params: any) => {
			const req = pendingRequests.get(params.requestId);
			const res = responseInfo.get(params.requestId);
			pendingRequests.delete(params.requestId);
			responseInfo.delete(params.requestId);
			if (!req || !res || !this.networkCaptureCallback) return;

			// Skip responses that are clearly not API data (HTML pages, images, CSS)
			const ct = res.contentType.toLowerCase();
			if (ct.includes('text/html') || ct.includes('text/css') || ct.includes('image/') || ct.includes('font/')) return;
			// Keep: JSON, no content-type (many APIs don't set it), text/plain, etc.

			// Skip analytics/tracking
			const skip = [
				'google-analytics',
				'googleadservices',
				'google.com/ccm',
				'sentry.io',
				'forter.com',
				'riskified.com',
				'doubleclick.net',
			];
			if (skip.some((s) => res.url.includes(s))) return;

			try {
				const bodyResult = await this.cdp!.send('Network.getResponseBody', {
					requestId: params.requestId,
				});
				let resBody: unknown;
				try {
					resBody = JSON.parse(bodyResult.body);
				} catch {
					resBody = bodyResult.body;
				}
				this.networkCaptureCallback(req, {
					url: res.url,
					status: res.status,
					headers: res.headers,
					body: resBody,
				});
			} catch {
				/* body unavailable */
			}
		});
	}

	/**
	 * Check if browser is running.
	 */
	isActive(): boolean {
		return this.isRunning && this.context !== null;
	}

	// -------------------------------------------------------------------------
	// Private methods
	// -------------------------------------------------------------------------

	private async switchPage(newPage: Page): Promise<void> {
		await this.stopScreencast();

		this.page = newPage;

		if (this.urlChangeCallback) {
			this.urlChangeCallback(newPage.url());
		}

		await this.startScreencast();
	}

	private async startScreencast(): Promise<void> {
		if (!this.page || !this.context) {
			return;
		}

		try {
			this.cdp = await this.context.newCDPSession(this.page);

			// Enable network capture via CDP — catches ALL XHR/Fetch including cross-domain
			await this.cdp.send('Network.enable');
			this.setupNetworkCapture();

			// Reset throttling state
			this.lastFrameSentAt = 0;
			this.pendingFrame = null;

			this.cdp.on(
				'Page.screencastFrame',
				(evt: { data: string; sessionId: number; metadata: { timestamp?: number } }) => {
					if (!this.isRunning || !this.frameCallback) {
						return;
					}

					// Always ACK immediately to keep CDP flowing
					void this.cdp?.send('Page.screencastFrameAck', { sessionId: evt.sessionId });

					const bytes = Buffer.from(evt.data, 'base64');
					this.frameId++;

					const frame: FrameData = {
						frameId: this.frameId,
						bytes: new Uint8Array(bytes),
						timestamp: evt.metadata.timestamp ? evt.metadata.timestamp * 1000 : Date.now(),
					};

					// Double-buffer throttling: always keep latest frame, send at interval
					const now = Date.now();
					const elapsed = now - this.lastFrameSentAt;

					if (elapsed >= this.frameIntervalMs) {
						// Enough time passed, send this frame immediately
						this.lastFrameSentAt = now;
						this.pendingFrame = null;
						this.frameCallback(frame);
					} else {
						// Too soon, store as pending (overwrites previous pending)
						const hadPending = this.pendingFrame !== null;
						this.pendingFrame = frame;

						// Schedule send if not already scheduled
						if (!hadPending) {
							const delay = this.frameIntervalMs - elapsed;
							setTimeout(() => {
								if (this.pendingFrame && this.frameCallback && this.isRunning) {
									this.lastFrameSentAt = Date.now();
									this.frameCallback(this.pendingFrame);
									this.pendingFrame = null;
								}
							}, delay);
						}
					}
				},
			);

			// Request frames at max rate from CDP, we throttle on our side
			await this.cdp.send('Page.startScreencast', {
				format: 'jpeg',
				quality: this.config.quality,
				maxWidth: this.config.viewportWidth,
				maxHeight: this.config.viewportHeight,
				everyNthFrame: 1,
			});
		} catch {
			this.handleCrash('Failed to start screencast');
		}
	}

	private async stopScreencast(): Promise<void> {
		if (!this.cdp) return;
		try {
			await this.cdp.send('Page.stopScreencast');
			await this.cdp.detach();
		} catch {
			// Ignore errors during cleanup
		} finally {
			this.cdp = null;
		}
	}

	private handleCrash(reason: string): void {
		if (!this.isRunning) return;

		this.isRunning = false;

		void this.stopScreencast();

		if (this.crashCallback) {
			this.crashCallback(reason);
		}

		this.context = null;
		this.page = null;
	}

	private handleOperationError(operation: string, err: unknown): void {
		const errMsg = err instanceof Error ? err.message : String(err);

		if (
			errMsg.includes('closed') ||
			errMsg.includes('Target page') ||
			errMsg.includes('Target closed')
		) {
			this.handleCrash(`${operation} failed: browser closed`);
			return;
		}

		if (this.errorCallback) {
			this.errorCallback(err instanceof Error ? err : new Error(errMsg));
		}
	}

	private assertPageAvailable(): void {
		if (!this.page) {
			throw new Error('Browser not started');
		}
		if (!this.isRunning) {
			throw new Error('Browser has stopped');
		}
	}
}
