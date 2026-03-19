/**
 * Fetch with Retry
 *
 * Configurable retry wrapper for any async operation. Use in route handlers
 * and dashboard components where transient failures (network, anti-bot,
 * browser navigation) are expected.
 *
 * Usage:
 *   import { fetchWithRetry } from '@interceptor/shared';
 *
 *   const data = await fetchWithRetry(() => fetch(url).then(r => r.json()), {
 *     retries: 2,
 *     backoffMs: 1000,
 *     shouldRetry: (err) => !(err instanceof AuthError),
 *   });
 *
 * @module shared/fetch-retry
 */

export interface RetryOptions {
	/** Number of retry attempts after the first failure. Default: 2 */
	retries?: number;
	/** Base delay in ms between retries (multiplied by attempt number). Default: 1000 */
	backoffMs?: number;
	/** Optional predicate — return false to stop retrying early. Default: always retry. */
	shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Execute an async function with configurable retry and exponential backoff.
 * Retries on thrown errors only — resolved values (even error-shaped ones) are not retried.
 */
export async function fetchWithRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const { retries = 2, backoffMs = 1000, shouldRetry } = options;

	let lastError: unknown;
	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			if (attempt < retries) {
				if (shouldRetry && !shouldRetry(err, attempt)) break;
				await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
			}
		}
	}
	throw lastError;
}

/**
 * Map HTTP status codes to user-friendly error messages.
 * Use in dashboard components to display actionable errors.
 */
export function friendlyHttpError(status: number): string {
	if (status === 500) return 'Browser not connected. Open the Browser page to connect first.';
	if (status === 503) return 'Service unavailable — browser may be restarting.';
	if (status === 429) return 'Rate limited — wait a moment and try again.';
	if (status === 403) return 'Access blocked — the site may require a captcha challenge.';
	if (status === 401) return 'Authentication required — connect via the Browser page.';
	return `Error ${status} — try again or check the Browser page.`;
}
