/**
 * Stealth Configuration for Browser Automation & HTTP Requests
 *
 * Contains up-to-date User-Agent strings and browser fingerprint settings
 * to avoid bot detection. Data sourced from useragents.me.
 *
 * Last updated: December 2025 (Chrome 134)
 */

// =============================================================================
// User-Agent Pools
// =============================================================================

/**
 * Pool of real, current User-Agents from useragents.me (updated March 2025)
 * These are the most common desktop UAs to blend in with real traffic.
 *
 * CRITICAL: Never include "Headless" in UA - that's the main detection vector.
 * CRITICAL: Keep these updated quarterly - outdated UAs are suspicious.
 */
export const DESKTOP_USER_AGENTS = [
	// Chrome 134 on Mac (most common desktop UA as of March 2025 - 21% share)
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
	// Chrome 134 on Windows (17.34% market share)
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
	// Chrome 134 on Linux (3.72% share)
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
	// Edge 134 on Windows (common enterprise browser)
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.3124.85',
	// Edge 134 on Mac
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.3124.85',
] as const;

/**
 * Mobile User-Agents for mobile-first sites
 */
export const MOBILE_USER_AGENTS = [
	// Chrome Mobile on Android (63% mobile share)
	'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Mobile Safari/537.36',
	// Safari on iPhone (8.25% share)
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3.1 Mobile/15E148 Safari/604.1',
	// Chrome on iPhone (4.85% share)
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/134.0.6998.99 Mobile/15E148 Safari/604.1',
] as const;

// =============================================================================
// UA Selection Helpers
// =============================================================================

/**
 * Get a random desktop User-Agent from the pool
 * Use this for browser automation and fetch requests
 */
export function getRandomDesktopUA(): string {
	return DESKTOP_USER_AGENTS[Math.floor(Math.random() * DESKTOP_USER_AGENTS.length)];
}

/**
 * Get a random mobile User-Agent from the pool
 */
export function getRandomMobileUA(): string {
	return MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
}

/**
 * Get the most common desktop User-Agent (Mac Chrome)
 * Use when you want consistency over randomization
 */
export function getMostCommonDesktopUA(): string {
	return DESKTOP_USER_AGENTS[0];
}

// =============================================================================
// Browser Launch Configuration
// =============================================================================

/**
 * Chrome args for stealth mode
 * These prevent common headless detection methods
 */
export const STEALTH_BROWSER_ARGS = [
	'--no-first-run',
	'--no-default-browser-check',
	'--disable-blink-features=AutomationControlled', // Hides navigator.webdriver
	'--disable-dev-shm-usage',
	'--no-sandbox',
	'--disable-infobars',
	'--disable-background-timer-throttling',
	'--disable-backgrounding-occluded-windows',
	'--disable-renderer-backgrounding',
] as const;

/**
 * Common viewport sizes (realistic desktop resolutions)
 */
export const COMMON_VIEWPORTS = {
	desktop1440: { width: 1440, height: 900 },
	desktop1920: { width: 1920, height: 1080 },
	desktop1366: { width: 1366, height: 768 },
	laptop: { width: 1280, height: 800 },
} as const;

// =============================================================================
// HTTP Request Headers
// =============================================================================

/**
 * Build realistic headers for HTTP fetch requests
 * Use this instead of hardcoding headers in each file
 */
export function buildFetchHeaders(options?: {
	userAgent?: string;
	contentType?: string;
	origin?: string;
	referer?: string;
	accept?: string;
}): Record<string, string> {
	const ua = options?.userAgent ?? getRandomDesktopUA();
	return {
		'User-Agent': ua,
		Accept: options?.accept ?? 'application/json, text/javascript, */*; q=0.01',
		'Accept-Language': 'en-US,en;q=0.9',
		'Accept-Encoding': 'gzip, deflate, br',
		...(options?.contentType && { 'Content-Type': options.contentType }),
		...(options?.origin && { Origin: options.origin }),
		...(options?.referer && { Referer: options.referer }),
	};
}

/**
 * Headers for XHR/Ajax requests (e.g., form-encoded API calls)
 */
export function buildXhrHeaders(origin: string, referer: string): Record<string, string> {
	return {
		'Content-Type': 'application/x-www-form-urlencoded',
		'X-Requested-With': 'XMLHttpRequest',
		'User-Agent': getRandomDesktopUA(),
		Accept: 'application/json, text/javascript, */*; q=0.01',
		'Accept-Language': 'en-US,en;q=0.9',
		Origin: origin,
		Referer: referer,
	};
}

/**
 * Headers for HTML page requests
 */
export function buildHtmlHeaders(referer?: string): Record<string, string> {
	return {
		'User-Agent': getRandomDesktopUA(),
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
		'Accept-Language': 'en-US,en;q=0.9',
		...(referer && { Referer: referer }),
	};
}
