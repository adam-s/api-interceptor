/**
 * Core Types for Browser Scrapers
 *
 * Simple, unified types used across all scraper modules.
 * No external dependencies - just TypeScript.
 */

import type { BrowserContext, Page } from 'patchright';

// =============================================================================
// Result Type (replaces neverthrow)
// =============================================================================

/**
 * Simple discriminated union for success/error results.
 * Lighter weight than neverthrow, easier to understand.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/** Create a success result */
export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

/** Create an error result */
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// =============================================================================
// Error Types
// =============================================================================

export type ScraperErrorType =
	| 'http' // HTTP error (4xx, 5xx)
	| 'network' // Network/connection error
	| 'timeout' // Request/operation timeout
	| 'parse' // Failed to parse response
	| 'validation' // Data validation failed
	| 'captcha' // CAPTCHA/bot detection
	| 'unknown'; // Unknown error

export interface ScraperError {
	type: ScraperErrorType;
	message: string;
	retryable: boolean;
	status?: number;
	cause?: unknown;
}

/** Create a scraper error */
export function scraperError(
	type: ScraperErrorType,
	message: string,
	options?: { retryable?: boolean; status?: number; cause?: unknown },
): ScraperError {
	return {
		type,
		message,
		retryable: options?.retryable ?? false,
		...(options?.status !== undefined && { status: options.status }),
		...(options?.cause !== undefined && { cause: options.cause }),
	};
}

// =============================================================================
// Scraper Options (Unified Input API)
// =============================================================================

/**
 * Base options for all scraper functions.
 * Provides consistent interface across data sources.
 */
export interface ScraperOptions {
	/** Start date (YYYY-MM-DD) */
	dateFrom: string;

	/** End date (YYYY-MM-DD) */
	dateTo: string;

	/** Country filter (ISO 2-letter codes or source-specific IDs) */
	countryIds?: string[];

	/** Symbol filter (e.g., ['NAPMPMI', 'GDP']) */
	symbols?: string[];

	/** Timezone for date interpretation (default: UTC) */
	timeZone?: string;

	/** Run browser in headless mode (default: true) */
	headless?: boolean;

	/** Request timeout in ms (default: 30000) */
	timeout?: number;

	/** Max requests per minute for rate limiting */
	maxRequestsPerMinute?: number;

	/** Custom headers to include */
	headers?: Record<string, string>;

	/** AbortSignal for cancellation */
	signal?: AbortSignal;
}

// =============================================================================
// Calendar Event (Unified Output Type)
// =============================================================================

export type DataSource = 'investing' | 'tradingeconomics' | 'bloomberg';
export type ImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Unified calendar event type.
 * All scraper outputs normalize to this format for storage.
 */
export interface CalendarEvent {
	/** Unique ID with source prefix (e.g., "investing:123", "te:NAPMPMI:2025-01-01") */
	eventId: string;

	/** Data source identifier */
	source: DataSource;

	/** Event datetime (ISO 8601) */
	datetime: string;

	/** Release time if known (HH:mm) */
	releaseTime?: string;

	/** Country (ISO 2-letter code) */
	country: string;

	/** Currency (ISO 3-letter code) */
	currency: string;

	/** Impact level */
	impactLevel: ImpactLevel;

	/** Event/indicator name */
	eventName: string;

	/** TE symbol if available */
	symbol?: string;

	/** Actual released value */
	actual?: string;

	/** Forecast/expected value */
	forecast?: string;

	/** Previous period value */
	previous?: string;

	/** URL to event details */
	detailUrl?: string;

	/** When this data was scraped (ISO 8601) */
	scrapedAt: string;
}

// =============================================================================
// Historical Data Types
// =============================================================================

/**
 * Single historical data point for an event/indicator.
 */
export interface HistoricalDataPoint {
	/** Release date (YYYY-MM-DD) */
	date: string;

	/** Actual released value */
	actual?: string;

	/** Forecast/expected value */
	forecast?: string;

	/** Previous period value */
	previous?: string;
}

/**
 * Metadata about an indicator's history.
 */
export interface HistoricalMeta {
	/** Indicator name */
	indicatorName: string;

	/** Source-specific indicator ID */
	indicatorId?: string;

	/** Data source name */
	sourceName?: string;

	/** Source URL */
	sourceUrl?: string;

	/** Next scheduled release */
	nextRelease?: string;
}

/**
 * Full historical data for an indicator.
 */
export interface HistoricalData {
	/** History entries, newest first */
	entries: HistoricalDataPoint[];

	/** Metadata about the indicator */
	meta?: HistoricalMeta;
}

// =============================================================================
// Time Series Types (for TE API)
// =============================================================================

/**
 * Time series data point from TradingEconomics API.
 */
export interface TimeSeriesPoint {
	/** Date (YYYY-MM-DD) */
	date: string;

	/** Value */
	value: number;
}

/**
 * Full time series response.
 */
export interface TimeSeries {
	/** Symbol identifier */
	symbol: string;

	/** Data points, oldest first */
	data: TimeSeriesPoint[];

	/** Data source */
	source: DataSource;

	/** When fetched */
	fetchedAt: string;
}

// =============================================================================
// Browser Session Types
// =============================================================================

export interface BrowserLaunchOptions {
	/** Profile directory for persistent sessions */
	profileDir?: string;

	/** Run in headless mode (default: true) */
	headless?: boolean;

	/** Browser channel (e.g., 'chrome', 'msedge') */
	channel?: string;

	/** Custom user agent (uses random from pool if not set) */
	userAgent?: string;
}

export interface BrowserSession {
	context: BrowserContext;
	page: Page;
}

// =============================================================================
// Source-Specific Types (for internal use)
// =============================================================================

/**
 * Raw response from Investing.com calendar API.
 */
export interface InvestingCalendarResponse {
	dateFrom: string;
	dateTo: string;
	data: string; // HTML string
	params: {
		country: string[];
		offsetSec: number;
		timeZone: string;
	};
}

/**
 * Raw event from TradingEconomics calendar.
 */
export interface TECalendarEvent {
	date: string;
	time?: string;
	country: string;
	event: string;
	symbol?: string;
	importance: number; // 1-3
	actual?: string;
	forecast?: string;
	previous?: string;
	url?: string;
}

/**
 * Raw data point from TradingEconomics API.
 */
export interface TEApiDataPoint {
	date: string; // ISO timestamp
	value: number;
}
