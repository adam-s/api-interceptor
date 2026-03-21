/**
 * Boardshop Site — E-commerce fake website.
 *
 * Simulates e-commerce ticket/listing patterns:
 * - Embedded JSON in <script id="catalog-data" type="application/json">
 * - POST pagination to same URL with CSRF + filterSessionId
 * - Silent page size limit (pageSize > 20 returns empty)
 * - Cursor-based pagination for reviews
 * - Custom DOM elements with data attributes
 * - Multiple auth token sources (hidden input, cookie, window global)
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getProductPage, getReviewsCursor, MAX_PAGE_SIZE, PRODUCTS } from '../data/products';
import { renderEmbeddedPage } from '../transports/embedded-html';

// In-memory session store for CSRF tokens
const sessions = new Map<string, { csrf: string; filterSessionId: string }>();

function getOrCreateSession(sessionId: string | undefined): {
	sessionId: string;
	csrf: string;
	filterSessionId: string;
} {
	const sid = sessionId ?? randomUUID();
	if (!sessions.has(sid)) {
		sessions.set(sid, { csrf: randomUUID(), filterSessionId: randomUUID() });
	}
	const session = sessions.get(sid)!;
	return { sessionId: sid, ...session };
}

export function createBoardshopSite(): Hono {
	const app = new Hono();

	// ─── Main catalog page (GET = HTML with embedded JSON) ───────────
	app.get('/', (c) => {
		const q = c.req.query('q') ?? '';
		const category = c.req.query('category') as
			| 'decks'
			| 'trucks'
			| 'wheels'
			| 'accessories'
			| undefined;
		const sessionCookie = c.req.header('cookie')?.match(/_sid=([^;]+)/)?.[1];
		const session = getOrCreateSession(sessionCookie);

		const page1 = getProductPage(1, MAX_PAGE_SIZE, category);

		// Filter by search query if provided
		const filteredItems = q
			? page1.items.filter(
					(p) =>
						p.name.toLowerCase().includes(q.toLowerCase()) ||
						p.brand.toLowerCase().includes(q.toLowerCase()),
				)
			: page1.items;

		const catalogData = {
			catalog: {
				items: filteredItems,
				totalCount: q ? filteredItems.length : page1.totalCount,
				currentPage: 1,
				pageSize: MAX_PAGE_SIZE,
				filterSessionId: session.filterSessionId,
				itemsRemaining: q ? 0 : page1.remaining,
			},
			categories: ['decks', 'trucks', 'wheels', 'accessories'],
			searchQuery: q,
		};

		// Build custom element HTML for each product
		const productElements = filteredItems
			.map(
				(p) =>
					`<div data-testid="product-card" data-sku="${p.sku}">` +
					`<board-price data-sku="${p.sku}" data-field="price" data-value="${p.price}">$${p.price.toFixed(2)}</board-price>` +
					`<board-stock data-sku="${p.sku}" data-field="stock" data-value="${p.stock}">${p.stock} in stock</board-stock>` +
					`<board-rating data-sku="${p.sku}" data-field="rating" data-value="${p.rating}">${p.rating}/5</board-rating>` +
					`<span data-testid="product-name">${p.name}</span>` +
					`<span data-testid="product-brand">${p.brand}</span>` +
					`</div>`,
			)
			.join('\n');

		const html = renderEmbeddedPage({
			title: q ? `Search: ${q} — BoardShop` : 'BoardShop — Skateboards & Gear',
			dataScripts: [
				{ id: 'catalog-data', data: catalogData },
				{ id: 'app-context', data: { appName: 'boardshop', version: '2.1.0' } },
			],
			windowGlobals: {
				__SESSION__: { id: session.sessionId, filterSessionId: session.filterSessionId },
			},
			hiddenInputs: [{ id: 'csrf-token', name: 'csrf-token', value: session.csrf }],
			metaTags: [{ name: 'api-key', content: 'pk_test_boardshop_abc123' }],
			bodyHtml: `<section data-testid="product-grid">\n${productElements}\n</section>`,
			cookies: [{ name: '_sid', value: session.sessionId, path: '/' }],
		});

		c.header('Set-Cookie', `_sid=${session.sessionId}; Path=/; SameSite=Lax`);
		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── POST pagination (same URL!) ────────────────────────────────
	app.post('/', async (c) => {
		const body = (await c.req.json()) as {
			page?: number;
			pageSize?: number;
			filterSessionId?: string;
			csrf?: string;
			category?: string;
			sort?: string;
		};

		// Validate CSRF
		const sessionCookie = c.req.header('cookie')?.match(/_sid=([^;]+)/)?.[1];
		if (!sessionCookie || !sessions.has(sessionCookie)) {
			return c.json({ items: [], error: 'Invalid session' }, 403);
		}
		const session = sessions.get(sessionCookie)!;

		// Validate CSRF token (from hidden input or header)
		const csrf = body.csrf ?? c.req.header('x-csrf-token');
		if (csrf !== session.csrf) {
			return c.json({ items: [], error: 'Invalid CSRF token' }, 403);
		}

		// Validate filterSessionId
		if (body.filterSessionId !== session.filterSessionId) {
			return c.json({ items: [] }); // Silent fail — like real sites
		}

		const page = body.page ?? 1;
		const pageSize = body.pageSize ?? MAX_PAGE_SIZE;
		const result = getProductPage(
			page,
			pageSize,
			body.category as 'decks' | 'trucks' | 'wheels' | 'accessories' | undefined,
		);

		// POST response is FLATTER than GET — items at top level, not nested under catalog
		return c.json({
			items: result.items,
			remaining: result.remaining,
			totalCount: result.totalCount,
			currentPage: result.currentPage,
		});
	});

	// ─── Product detail page ────────────────────────────────────────
	app.get('/product/:sku', (c) => {
		const sku = c.req.param('sku');
		const product = PRODUCTS.find((p) => p.sku === sku);
		if (!product) return c.text('Not Found', 404);

		const html = renderEmbeddedPage({
			title: `${product.name} — BoardShop`,
			dataScripts: [
				{
					id: 'product-data',
					data: {
						product,
						relatedSkus: PRODUCTS.filter((p) => p.category === product.category && p.sku !== sku)
							.slice(0, 4)
							.map((p) => p.sku),
					},
				},
			],
			bodyHtml:
				`<div data-testid="product-detail" data-sku="${sku}">` +
				`<h1 data-testid="product-title">${product.name}</h1>` +
				`<board-price data-sku="${sku}" data-field="price" data-value="${product.price}">$${product.price.toFixed(2)}</board-price>` +
				`<board-stock data-sku="${sku}" data-field="stock" data-value="${product.stock}">${product.stock} in stock</board-stock>` +
				`<p data-testid="product-description">${product.description}</p>` +
				`</div>`,
		});

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── Cursor-based review pagination ─────────────────────────────
	app.get('/reviews', (c) => {
		const after = c.req.query('after') ?? null;
		const limit = Math.min(Number(c.req.query('limit') ?? 10), 20);
		const result = getReviewsCursor(after, limit);
		return c.json(result);
	});

	// ─── JSON API (for testing direct API access) ───────────────────
	app.get('/api/products', (c) => {
		const apiKey = c.req.header('x-api-key') ?? c.req.query('apiKey');
		if (apiKey !== 'pk_test_boardshop_abc123') {
			return c.json({ error: 'Invalid API key' }, 401);
		}
		const page = Number(c.req.query('page') ?? 1);
		const pageSize = Number(c.req.query('pageSize') ?? MAX_PAGE_SIZE);
		const category = c.req.query('category') as
			| 'decks'
			| 'trucks'
			| 'wheels'
			| 'accessories'
			| undefined;
		return c.json(getProductPage(page, pageSize, category));
	});

	// ─── WAF-protected path (same data, requires session cookie) ──
	// Pattern: Some sites serve the same data at both a public path and
	// a protected path. Agents should discover the public path works
	// without a browser and use rateLimitedFetch (direct HTTP).
	app.get('/secure/catalog', (c) => {
		const sessionCookie = c.req.header('cookie')?.match(/_sid=([^;]+)/)?.[1];
		if (!sessionCookie || !sessions.has(sessionCookie)) {
			// WAF challenge — returns HTML with JS challenge, not the data
			c.header('Content-Type', 'text/html; charset=utf-8');
			return c.html(
				'<html><body><script src="/challenge.js"></script><p>Checking your browser...</p></body></html>',
				202,
			);
		}
		// Same data as public catalog, but requires browser session
		const page1 = getProductPage(1, MAX_PAGE_SIZE);
		return c.json({ items: page1.items, totalCount: page1.totalCount });
	});

	// ─── Custom-header API (returns 404 without required headers) ──
	// Pattern: Some internal APIs require specific custom headers that
	// are discoverable in browser traffic or JS bundles. Without them
	// the endpoint returns 404/empty, not an auth error.
	app.get('/api/inventory/:sku', (c) => {
		const platform = c.req.header('x-app-platform');
		const region = c.req.header('x-app-region');
		if (!platform || !region) {
			return c.json({ error: 'Not found' }, 404);
		}
		const sku = c.req.param('sku');
		const product = PRODUCTS.find((p) => p.sku === sku);
		if (!product) return c.json({ error: 'Product not found' }, 404);
		return c.json({
			sku: product.sku,
			stock: product.stock,
			warehouses: [
				{ id: 'WH-01', name: 'East', available: Math.floor(product.stock * 0.6) },
				{ id: 'WH-02', name: 'West', available: Math.ceil(product.stock * 0.4) },
			],
			lastUpdated: new Date().toISOString(),
		});
	});

	// ─── UA-gated endpoint (simulates TLS fingerprint blocking) ────
	// Pattern: Some APIs reject non-browser requests (Node fetch gets
	// 429, browser fetch works). Agents should try direct HTTP first,
	// then escalate to browserFetch when blocked.
	app.get('/api/availability', (c) => {
		const ua = c.req.header('user-agent') ?? '';
		const isLikelyBrowser =
			ua.includes('Chrome/') || ua.includes('Firefox/') || ua.includes('Safari/');
		if (!isLikelyBrowser) {
			return c.json({ error: 'Too many requests' }, 429);
		}
		const category = c.req.query('category') as
			| 'decks'
			| 'trucks'
			| 'wheels'
			| 'accessories'
			| undefined;
		const result = getProductPage(1, MAX_PAGE_SIZE, category);
		return c.json({
			available: result.items.filter((p) => p.stock > 0).length,
			totalProducts: result.totalCount,
			items: result.items.map((p) => ({ sku: p.sku, name: p.name, stock: p.stock })),
		});
	});

	// ─── Rate-limited endpoint (Yahoo Finance pattern) ─────────────
	// Returns 429 on every 2nd+ request per session. Teaches agents to
	// bail after 3 retries and use embedded JSON fallback instead.
	// The SAME data is available via embedded JSON on GET / — agents
	// should discover this and stop retrying the rate-limited endpoint.
	const rateLimitHits = new Map<string, number>();
	app.get('/api/chart/:sku', (c) => {
		const ip = c.req.header('x-forwarded-for') ?? 'default';
		const hits = (rateLimitHits.get(ip) ?? 0) + 1;
		rateLimitHits.set(ip, hits);

		// First request succeeds, subsequent get 429
		if (hits > 1) {
			c.header('Retry-After', '60');
			return c.json({ error: 'Too many requests' }, 429);
		}

		const sku = c.req.param('sku');
		const product = PRODUCTS.find((p) => p.sku === sku);
		if (!product) return c.json({ error: 'Not found' }, 404);

		return c.json({
			sku: product.sku,
			name: product.name,
			price: product.price,
			priceHistory: Array.from({ length: 30 }, (_, i) => ({
				date: `2026-02-${String(i + 1).padStart(2, '0')}`,
				price: Math.round((product.price + (Math.random() - 0.5) * 10) * 100) / 100,
			})),
		});
	});

	// ─── __NEXT_DATA__ page (Ticketmaster/Next.js pattern) ──────────
	// Same catalog data, but wrapped in __NEXT_DATA__ Redux state.
	// Agents must navigate: props.pageProps.initialReduxState.api.queries
	app.get('/nextjs', (c) => {
		const page1 = getProductPage(1, MAX_PAGE_SIZE);
		const nextData = {
			props: {
				pageProps: {
					initialReduxState: {
						api: {
							queries: {
								'searchResults({})': {
									status: 'fulfilled',
									data: {
										items: page1.items,
										totalCount: page1.totalCount,
										pageSize: page1.pageSize,
									},
								},
								'getConfig({})': {
									status: 'fulfilled',
									data: {
										siteName: 'BoardShop',
										apiBase: '/api/v2',
									},
								},
							},
						},
					},
				},
			},
			page: '/search',
			query: {},
		};

		const html = `<!DOCTYPE html>
<html><head><meta name="next-head-count" content="3"><title>BoardShop — Next.js</title></head>
<body><div id="__next"><p>Loading...</p></div>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
</body></html>`;

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── Deferred state page (Airbnb/Niobe pattern) ─────────────────
	// Data nested at clientData[0][1].data.presentation.searchResults
	// Different nesting depth than standard embedded JSON.
	app.get('/deferred', (c) => {
		const page1 = getProductPage(1, MAX_PAGE_SIZE);
		const deferredState = [
			[
				'SearchController',
				{
					data: {
						presentation: {
							searchResults: page1.items,
							metadata: {
								totalCount: page1.totalCount,
								pageSize: page1.pageSize,
								nextPageCursor: Buffer.from(JSON.stringify({ offset: 20, version: 1 })).toString(
									'base64',
								),
							},
						},
					},
				},
			],
		];

		const html = `<!DOCTYPE html>
<html><head><title>BoardShop — Deferred State</title></head>
<body><div id="app"><p>Loading results...</p></div>
<script id="data-deferred-state-0" type="application/json">${JSON.stringify(deferredState)}</script>
</body></html>`;

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── POST ?method= dispatch (StubHub pattern) ───────────────────
	// Same URL, different ?method= query param selects the operation.
	app.post('/methods', async (c) => {
		const method = c.req.query('method');
		if (!method) {
			return c.json({ error: 'method query param required' }, 400);
		}

		if (method === 'GetProducts') {
			const body = (await c.req.json().catch(() => ({}))) as {
				page?: number;
				category?: string;
			};
			const page = body.page ?? 1;
			const category = body.category as 'decks' | 'trucks' | 'wheels' | 'accessories' | undefined;
			return c.json(getProductPage(page, MAX_PAGE_SIZE, category));
		}

		if (method === 'GetCategories') {
			return c.json({
				categories: [
					{ id: 'decks', name: 'Skate Decks', count: 40 },
					{ id: 'trucks', name: 'Trucks', count: 30 },
					{ id: 'wheels', name: 'Wheels', count: 30 },
					{ id: 'accessories', name: 'Accessories', count: 20 },
				],
			});
		}

		if (method === 'GetFeatured') {
			const featured = PRODUCTS.filter((p) => p.rating >= 4.5).slice(0, 5);
			return c.json({ featured });
		}

		return c.json({ error: `Unknown method: ${method}` }, 400);
	});

	// ─── Base64 cursor pagination (Airbnb pattern) ──────────────────
	// Accepts ?cursor=base64({"offset":20}) alongside existing ?after= string cursors.
	// Returns nextCursor as a base64-encoded JSON object.
	app.get('/catalog/cursor', (c) => {
		let offset = 0;
		const cursorParam = c.req.query('cursor');
		if (cursorParam) {
			try {
				const decoded = JSON.parse(Buffer.from(cursorParam, 'base64').toString('utf-8')) as {
					offset?: number;
				};
				offset = decoded.offset ?? 0;
			} catch {
				return c.json({ error: 'Invalid cursor' }, 400);
			}
		}

		const limit = Math.min(Number(c.req.query('limit') ?? MAX_PAGE_SIZE), MAX_PAGE_SIZE);
		const items = PRODUCTS.slice(offset, offset + limit);
		const hasMore = offset + limit < PRODUCTS.length;
		const nextCursor = hasMore
			? Buffer.from(JSON.stringify({ offset: offset + limit, version: 1 })).toString('base64')
			: null;

		return c.json({
			items,
			totalCount: PRODUCTS.length,
			pageSize: limit,
			nextCursor,
			hasMore,
		});
	});

	return app;
}
