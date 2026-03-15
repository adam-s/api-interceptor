/**
 * Browser Configuration
 *
 * Inline config defaults for the browser package.
 * Replaces the @interceptor/shared BrowserConfig dependency.
 */

export interface BrowserConfig {
	headless: boolean;
	maxConcurrentTabs: number;
	idleTimeoutMs: number;
	defaultTimeoutMs: number;
	profileDir: string;
	cacheDir: string;
	channel: 'chromium' | 'chrome' | 'chrome-beta' | 'chrome-dev' | 'msedge';
	viewport: { width: number; height: number };
	deviceScaleFactor: number;
}

const DEFAULT_CONFIG: BrowserConfig = {
	headless: true,
	maxConcurrentTabs: 5,
	idleTimeoutMs: 300_000,
	defaultTimeoutMs: 30_000,
	profileDir: './data/browser-profiles',
	cacheDir: './data/cache',
	channel: 'chromium',
	viewport: { width: 1440, height: 900 },
	deviceScaleFactor: 2,
};

export function getBrowserConfig(overrides?: Partial<BrowserConfig>): BrowserConfig {
	return { ...DEFAULT_CONFIG, ...overrides };
}
