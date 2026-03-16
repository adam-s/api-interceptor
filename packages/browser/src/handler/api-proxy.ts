/**
 * Domain API Proxy
 *
 * Creates Hono routes that proxy API requests through the browser's
 * authenticated session via browserFetch(). This is the core service
 * layer: instead of downloading entire web pages, clients call these
 * lean JSON endpoints directly.
 *
 * The browser's cookies, CSRF tokens, and session state are automatically
 * included — no manual header management needed.
 *
 * @module browser/handler/api-proxy
 */

import { Hono } from 'hono';
import type { RemoteBrowserService } from '../remote/service.js';
import type { DomainRoute } from './domain-loader.js';

/**
 * Create a Hono sub-app that proxies API requests through the browser.
 *
 * Each DomainRoute becomes a Hono endpoint. When called, it runs
 * fetch() inside the Patchright browser page context, inheriting
 * the browser's cookies and session state.
 *
 * @param domainName - Domain identifier (for logging)
 * @param routes - API routes to expose
 * @param getBrowser - Function that returns the active browser (or null if disconnected)
 */
export function createDomainProxy(
	domainName: string,
	routes: DomainRoute[],
	getBrowser: () => RemoteBrowserService | null,
): Hono {
	const app = new Hono();

	// List all available routes for this domain
	app.get('/', (c) => {
		return c.json({
			domain: domainName,
			browserConnected: getBrowser() !== null,
			routes: routes.map((r) => ({
				method: r.method,
				path: r.path,
				targetUrl: r.targetUrl ?? '(custom handler)',
				description: r.description,
			})),
		});
	});

	for (const route of routes) {
		const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';

		app.on(method, route.path, async (c) => {
			const browser = getBrowser();
			if (!browser) {
				return c.json(
					{
						error: 'Browser not connected',
						hint: `Connect a browser session with profile "${domainName}" first`,
					},
					503,
				);
			}

			try {
				// Custom handler (Type B/B2/C): full access to Hono context + browser
				if (route.handler) {
					return route.handler(c, browser);
				}

				// Proxy handler (Type A): browserFetch targetUrl with cookies inherited
				const options: {
					method: 'GET' | 'POST' | 'PUT' | 'DELETE';
					headers?: Record<string, string>;
					body?: unknown;
				} = {
					method: route.method,
				};

				// Forward request body for POST/PUT
				if (route.method === 'POST' || route.method === 'PUT') {
					try {
						options.body = await c.req.json();
					} catch {
						// No body or not JSON — fine for some POST endpoints
					}
				}

				// Resolve target URL — substitute path params if present
				let targetUrl = route.targetUrl;
				const params = c.req.param() as Record<string, string>;
				for (const [key, value] of Object.entries(params)) {
					targetUrl = targetUrl.replace(`:${key}`, encodeURIComponent(String(value)));
					targetUrl = targetUrl.replace(`{${key}}`, encodeURIComponent(String(value)));
				}

				// Forward query string
				const queryString = new URL(c.req.url).search;
				if (queryString) {
					targetUrl += targetUrl.includes('?') ? `&${queryString.slice(1)}` : queryString;
				}

				// Execute fetch inside the browser context
				const result = await browser.browserFetch(targetUrl, options);

				// Return the proxied response
				return c.json(result.data, result.status as 200);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return c.json({ error: message, domain: domainName, route: route.path }, 502);
			}
		});
	}

	return app;
}
