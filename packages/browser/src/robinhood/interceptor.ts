/**
 * Robinhood Request Interceptor
 *
 * Uses Patchright's CDP-based route interception to capture
 * Robinhood API traffic and extract authentication headers.
 *
 * This replaces the XMLHttpRequest monkey-patching approach
 * used in the original Chrome extension.
 *
 * @module browser/robinhood/interceptor
 */

import type { Page, Request, Route } from 'patchright';
import {
	INTERCEPT_PATTERNS,
	REQUIRED_HEADER_NAMES,
	type RobinhoodHeaders,
	RobinhoodHeadersSchema,
} from './types';

/** Intercepted request data */
export interface InterceptedRequest {
	url: string;
	method: string;
	headers: Record<string, string>;
	body?: unknown;
	timestamp: number;
}

/** Intercepted response data */
export interface InterceptedResponse {
	url: string;
	status: number;
	headers: Record<string, string>;
	body: unknown;
	timestamp: number;
}

/** Callback for intercepted request/response pairs */
export type InterceptionCallback = (
	request: InterceptedRequest,
	response: InterceptedResponse,
) => void;

/** Events emitted by the interceptor */
export interface InterceptorEvents {
	headersCaputred: RobinhoodHeaders;
	request: InterceptedRequest;
	response: InterceptedResponse;
	error: Error;
}

/**
 * Robinhood API request interceptor using Patchright route API.
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
export class RobinhoodInterceptor {
	private capturedHeaders: Map<string, string> = new Map();
	private callbacks: Set<InterceptionCallback> = new Set();
	private headersPromiseResolve: ((headers: RobinhoodHeaders) => void) | null = null;
	private isAttached = false;
	private page: Page | null = null;

	/**
	 * Callback fired when all required headers are captured.
	 * Set this before attaching to receive notifications.
	 */
	public onHeadersCaptured: ((headers: RobinhoodHeaders) => void) | null = null;

	/**
	 * Get the currently captured headers, if any.
	 */
	getHeaders(): RobinhoodHeaders | null {
		// Check if we have all required headers
		for (const name of REQUIRED_HEADER_NAMES) {
			if (!this.capturedHeaders.has(name)) {
				return null;
			}
		}

		const headers: Record<string, string> = {};
		for (const name of REQUIRED_HEADER_NAMES) {
			const value = this.capturedHeaders.get(name);
			if (value) headers[name] = value;
		}

		// Validate with Zod
		const result = RobinhoodHeadersSchema.safeParse(headers);
		if (!result.success) {
			console.warn('[RobinhoodInterceptor] Invalid headers:', result.error.message);
			return null;
		}

		return result.data;
	}

	/**
	 * Check if all required headers have been captured.
	 */
	hasHeaders(): boolean {
		return this.getHeaders() !== null;
	}

	/**
	 * Clear captured headers (e.g., on logout).
	 */
	clearHeaders(): void {
		this.capturedHeaders.clear();
	}

	/**
	 * Register a callback for intercepted requests.
	 */
	onIntercept(callback: InterceptionCallback): () => void {
		this.callbacks.add(callback);
		return () => this.callbacks.delete(callback);
	}

	/**
	 * Wait for headers to be captured with timeout.
	 */
	waitForHeaders(timeoutMs: number): Promise<RobinhoodHeaders | null> {
		// If we already have headers, return immediately
		const existing = this.getHeaders();
		if (existing) {
			return Promise.resolve(existing);
		}

		return new Promise((resolve) => {
			// Set up resolver for when headers arrive
			this.headersPromiseResolve = resolve;

			// Set up timeout
			const timeout = setTimeout(() => {
				this.headersPromiseResolve = null;
				resolve(null);
			}, timeoutMs);

			// Check periodically in case headers were captured between checks
			const checkInterval = setInterval(() => {
				const headers = this.getHeaders();
				if (headers) {
					clearTimeout(timeout);
					clearInterval(checkInterval);
					this.headersPromiseResolve = null;
					resolve(headers);
				}
			}, 100);

			// Clean up interval on timeout
			setTimeout(() => clearInterval(checkInterval), timeoutMs);
		});
	}

	/**
	 * Attach the interceptor to a Patchright page.
	 */
	async attach(page: Page): Promise<void> {
		if (this.isAttached) {
			return;
		}

		this.page = page;
		this.isAttached = true;

		// Set up route handlers for Robinhood API patterns
		for (const pattern of INTERCEPT_PATTERNS) {
			await page.route(pattern, async (route) => {
				await this.handleRoute(route);
			});
		}
	}

	/**
	 * Detach the interceptor from the page.
	 */
	async detach(): Promise<void> {
		if (!this.isAttached || !this.page) {
			return;
		}

		// Remove all route handlers
		for (const pattern of INTERCEPT_PATTERNS) {
			await this.page.unroute(pattern);
		}

		this.page = null;
		this.isAttached = false;
		console.log('[RobinhoodInterceptor] Detached from page');
	}

	/**
	 * Handle an intercepted route.
	 */
	private async handleRoute(route: Route): Promise<void> {
		const request = route.request();
		const url = request.url();
		const method = request.method();
		const requestHeaders = request.headers();

		// Capture auth headers from the request
		this.extractHeaders(requestHeaders);

		// Build intercepted request data
		const interceptedRequest: InterceptedRequest = {
			url,
			method,
			headers: requestHeaders,
			body: this.parseRequestBody(request),
			timestamp: Date.now(),
		};

		try {
			// Continue the request and get the response
			const response = await route.fetch();
			const responseHeaders = response.headers();
			const status = response.status();

			// Try to parse response body as JSON
			let body: unknown;
			try {
				body = await response.json();
			} catch {
				// Not JSON, try text
				try {
					body = await response.text();
				} catch {
					body = null;
				}
			}

			const interceptedResponse: InterceptedResponse = {
				url,
				status,
				headers: responseHeaders,
				body,
				timestamp: Date.now(),
			};

			// Notify callbacks
			for (const callback of this.callbacks) {
				try {
					callback(interceptedRequest, interceptedResponse);
				} catch (error) {
					console.error('[RobinhoodInterceptor] Callback error:', error);
				}
			}

			// Fulfill the route with the response
			await route.fulfill({ response });
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
	 * Extract required headers from a request.
	 */
	private extractHeaders(headers: Record<string, string>): void {
		let capturedNew = false;

		for (const name of REQUIRED_HEADER_NAMES) {
			// Headers are case-insensitive, but Patchright lowercases them
			const lowerName = name.toLowerCase();
			const value = headers[lowerName] || headers[name];

			if (value && !this.capturedHeaders.has(name)) {
				this.capturedHeaders.set(name, value);
				capturedNew = true;
			}
		}

		// Check if we now have all headers
		if (capturedNew && this.hasHeaders()) {
			const capturedHeaders = this.getHeaders();
			if (!capturedHeaders) return;

			// Notify via promise (for waitForHeaders)
			if (this.headersPromiseResolve) {
				this.headersPromiseResolve(capturedHeaders);
				this.headersPromiseResolve = null;
			}

			// Notify via callback (for event-driven usage)
			if (this.onHeadersCaptured) {
				this.onHeadersCaptured(capturedHeaders);
			}
		}
	}

	/**
	 * Parse request body if present.
	 */
	private parseRequestBody(request: Request): unknown {
		try {
			const postData = request.postData();
			if (postData) {
				return JSON.parse(postData);
			}
		} catch {
			// Not JSON or no body
		}
		return undefined;
	}
}
