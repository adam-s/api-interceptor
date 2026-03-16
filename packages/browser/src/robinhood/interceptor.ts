/**
 * Robinhood Request Interceptor
 *
 * Extends GenericInterceptor with Robinhood-specific configuration.
 * Uses Patchright's CDP-based route interception to capture
 * Robinhood API traffic and extract authentication headers.
 *
 * @module browser/robinhood/interceptor
 */

import type { Route } from 'patchright';
import { GenericInterceptor } from '../shared/interceptor';
import { robinhoodInterceptorConfig } from './config';
import type { RobinhoodHeaders } from './types';

// Re-export shared types for backward compatibility
export type {
	InterceptedRequest,
	InterceptedResponse,
	InterceptionCallback,
} from '../shared/types';

/**
 * Robinhood API request interceptor.
 *
 * Usage:
 * ```typescript
 * const interceptor = new RobinhoodInterceptor();
 * interceptor.onHeadersCaptured = (headers) => {
 *   console.log('Got headers!', headers);
 * };
 * await interceptor.attach(page);
 *
 * // Or wait for headers
 * const headers = await interceptor.waitForHeaders(5000);
 * ```
 */
export class RobinhoodInterceptor extends GenericInterceptor {
	constructor() {
		super(robinhoodInterceptorConfig);
	}

	/**
	 * Override to provide Robinhood-specific error handling.
	 */
	protected async handleRoute(route: Route): Promise<void> {
		try {
			await super.handleRoute(route);
		} catch (error) {
			// Check if this is a "page closed" error - this is expected when browser is closed
			const errorMessage = error instanceof Error ? error.message : String(error);
			if (errorMessage.includes('Target page, context or browser has been closed')) {
				// Expected during cleanup - silently ignore
				return;
			}
			console.error('[RobinhoodInterceptor] Route handling error:', error);
			// Continue the request anyway to avoid blocking
			try {
				await route.continue();
			} catch {
				// Route may already be closed
			}
		}
	}

	/**
	 * Convenience method to get headers as RobinhoodHeaders type.
	 */
	getRobinhoodHeaders(): RobinhoodHeaders | null {
		const headers = this.getHeaders();
		if (!headers) return null;
		// Headers are already validated by schema in parent class
		return headers as RobinhoodHeaders;
	}
}
