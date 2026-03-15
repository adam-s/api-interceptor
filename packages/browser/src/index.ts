/**
 * @volat/browser — Stealth browser automation package
 *
 * Core primitives for Patchright-based browser automation:
 * - Stealth browser launcher with proxy support
 * - User-Agent pools and anti-detection configuration
 * - Browser pool with lazy init, tab reuse, and idle timeout
 * - Ghostery-based ad/tracker blocker with disk cache
 * - Scraper registry for managing multiple data sources
 *
 * @module browser
 */

// Config
export { type BrowserConfig, getBrowserConfig } from './config';

// Stealth browser
export { createBrowser, createBrowserContext, type BrowserOptions } from './stealth-browser';

// Stealth configuration (UA pools, args, headers)
export {
	DESKTOP_USER_AGENTS,
	MOBILE_USER_AGENTS,
	STEALTH_BROWSER_ARGS,
	COMMON_VIEWPORTS,
	getRandomDesktopUA,
	getRandomMobileUA,
	getMostCommonDesktopUA,
	buildFetchHeaders,
	buildXhrHeaders,
	buildHtmlHeaders,
} from './stealth';

// Browser pool
export { BrowserPool, getBrowserPool } from './pool';

// Blocker
export { BlockerManager, getBlockerManager } from './blocker';

// Scraper Registry
export {
	createHealthCheck,
	defineScraper,
	getScraperRegistry,
	type RegisteredScraper,
	type ScraperFetchFn,
	type ScraperHealthCheckFn,
	type ScraperHealthResult,
	type ScraperMeta,
	type ScraperRateLimit,
	ScraperRegistry,
	type ScraperSchedule,
} from './registry';

// Types
export {
	type Result,
	ok,
	err,
	type ScraperErrorType,
	type ScraperError,
	scraperError,
	type ScraperOptions,
	type DataSource,
	type ImpactLevel,
	type CalendarEvent,
	type BrowserLaunchOptions,
	type BrowserSession,
} from './types';
