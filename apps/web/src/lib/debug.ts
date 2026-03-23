/**
 * Browser-safe DEBUG logging.
 *
 * Cannot re-export from @interceptor/shared in client components because
 * it pulls in Node.js-only dependencies (rate-limiter, fs). This module
 * provides the same DEBUG(tag, message) interface for browser-side code.
 *
 * In development: logs to console.debug with [tag] prefix.
 * In production: no-op.
 */

const isDev = process.env.NODE_ENV === 'development';

export function DEBUG(tag: string, message: string | (() => string)): void {
	if (!isDev) return;
	const msg = typeof message === 'function' ? message() : message;
	console.debug(`[${tag}] ${msg}`);
}

export const DEBUG_DIR = '/tmp/interceptor-debug';
