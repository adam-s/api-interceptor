/**
 * Boardshop Site — E-commerce fake website.
 *
 * Simulates e-commerce catalog/listing patterns:
 * - Embedded JSON in <script id="catalog-data" type="application/json">
 * - POST pagination to same URL with CSRF + filterSessionId
 * - Silent page size limit (pageSize > 20 returns empty)
 * - Cursor-based pagination for reviews
 * - Custom DOM elements with data attributes
 * - Multiple auth token sources (hidden input, cookie, window global)
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
	buildPricingEmbedded,
	COLLECTION_LISTINGS,
	COLLECTIONS,
	getCollectionListingsPage,
	getDropInventoryPage,
	getProductPage,
	getResaleListingsPage,
	getReviewsCursor,
	MAX_PAGE_SIZE,
	PRO_DROPS,
	PRODUCTS,
} from '../data/products';
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
	// biome-ignore lint/style/noNonNullAssertion: sid was just set if missing
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
		// biome-ignore lint/style/noNonNullAssertion: checked has() on previous line
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

	// ─── Rate-limited endpoint (rate-limited API pattern) ─────────────
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

	// ─── __NEXT_DATA__ page (Next.js SSR pattern) ──────────
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

	// ─── Deferred state page (deferred state pattern) ─────────────────
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

	// ─── POST ?method= dispatch with CSRF (query param dispatch pattern) ────────
	// Same URL, different ?method= query param selects the operation.
	// Requires x-csrf-token header (extracted from hidden input on page).
	app.post('/methods', async (c) => {
		const method = c.req.query('method');
		if (!method) {
			return c.json({ error: 'method query param required' }, 400);
		}

		// Validate CSRF token if provided (optional for backward compat)
		const csrfHeader = c.req.header('x-csrf-token');
		const sessionCookie = c.req.header('cookie')?.match(/_sid=([^;]+)/)?.[1];
		if (csrfHeader && sessionCookie && sessions.has(sessionCookie)) {
			// biome-ignore lint/style/noNonNullAssertion: checked has() on previous line
			const session = sessions.get(sessionCookie)!;
			if (csrfHeader !== session.csrf) {
				return c.json({ error: 'Invalid CSRF token' }, 403);
			}
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

	// ─── Base64 cursor pagination (base64 cursor pattern) ──────────────────
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

	// ─── SvelteKit page (rate-limited API pattern) ────────────────────
	// SvelteKit wraps embedded data in <script data-sveltekit-fetched>
	// with an extra JSON envelope: {"status":200,"body":"\"value\""}
	// Also has a rate-limited API that returns the SAME data — agents
	// should use the embedded data, not fight the rate-limited API.
	app.get('/sveltekit', (c) => {
		const page1 = getProductPage(1, MAX_PAGE_SIZE);

		// SvelteKit fetched data — JSON-wrapped responses
		const tickerData = JSON.stringify(
			page1.items.slice(0, 10).map((p) => ({
				symbol: p.sku,
				name: p.name,
				price: p.price,
				change: Math.round((Math.random() - 0.5) * 10 * 100) / 100,
				volume: p.stock * 100,
			})),
		);

		const configData = JSON.stringify({
			crumb: randomUUID().slice(0, 11),
			apiHost: 'query.boardshop.example.com',
		});

		const html = `<!DOCTYPE html>
<html><head><title>BoardShop — SvelteKit</title>
<link rel="modulepreload" href="/_app/immutable/entry/start.js">
</head>
<body>
<div id="app"><p>Loading tickers...</p></div>
<script id="ticker-data" type="application/json" data-sveltekit-fetched>${JSON.stringify({ status: 200, body: tickerData })}</script>
<script type="application/json" data-sveltekit-fetched>${JSON.stringify({ status: 200, body: configData })}</script>
</body></html>`;

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── Hydrated page (hydration-stripped pattern) ─────────────────────
	// Simulates React hydration removing <script type="application/json">
	// from the DOM. The raw HTTP response has the data, but if you use
	// page.evaluate(document.outerHTML) after hydration, the script tags
	// are gone. Teaches: fetch raw HTML, don't rely on DOM after JS runs.
	//
	// GET /hydrated returns HTML where a <script> tag at the bottom
	// simulates removing the data script (like React hydration does).
	// The data IS in the raw response — agents must use rateLimitedFetch
	// or browserFetch to get the raw HTML, not page.evaluate().
	app.get('/hydrated', (c) => {
		const page1 = getProductPage(1, MAX_PAGE_SIZE);
		const indexData = {
			events: page1.items.map((p) => ({
				id: p.sku,
				name: p.name,
				price: p.price,
				venue: `${p.brand} Arena`,
				date: '2026-04-15',
			})),
			totalCount: page1.totalCount,
			pageSize: page1.pageSize,
		};

		const html = `<!DOCTYPE html>
<html><head><title>BoardShop — Hydrated Page</title></head>
<body>
<div id="root"><p>Loading events...</p></div>
<script id="index-data" type="application/json">${JSON.stringify(indexData)}</script>
<script>
// Simulate React hydration — removes the data script tag from DOM
// This is what React/Vue/Svelte frameworks do after reading the data
(function() {
  var el = document.getElementById('index-data');
  if (el) el.remove();
  document.getElementById('root').innerHTML = '<p>Events loaded via hydration</p>';
})();
</script>
</body></html>`;

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── JSONP callback wrapper pattern ─────────────────────────────
	// Some APIs return data wrapped in a callback function:
	// callback({"results":[...]})
	// Agents must strip the wrapper to parse the JSON.
	app.get('/api/suggest', (c) => {
		const q = c.req.query('q') ?? '';
		const callback = c.req.query('callback') ?? 'callback';
		const results = PRODUCTS.filter(
			(p) =>
				p.name.toLowerCase().includes(q.toLowerCase()) ||
				p.brand.toLowerCase().includes(q.toLowerCase()),
		).slice(0, 10);

		const data = JSON.stringify(results.map((p) => [p.name, p.sku]));
		c.header('Content-Type', 'application/javascript');
		return c.text(`${callback}(${data})`);
	});

	// ─── Captions/subtitle endpoint pattern ─────────────────────────
	// Media sites provide captions as JSON with timestamps.
	// Discoverable from embedded data (signed URLs in player config).
	app.get('/api/captions/:sku', (c) => {
		const sku = c.req.param('sku');
		const product = PRODUCTS.find((p) => p.sku === sku);
		if (!product) return c.json({ error: 'Not found' }, 404);

		const lang = c.req.query('lang') ?? 'en';
		return c.json({
			language: lang,
			events: [
				{ start: 0, end: 3000, text: `Introducing the ${product.name}` },
				{ start: 3000, end: 6000, text: `Made by ${product.brand}` },
				{ start: 6000, end: 9000, text: `Category: ${product.category}` },
				{ start: 9000, end: 12000, text: `Price: $${product.price.toFixed(2)}` },
			],
			availableLanguages: ['en', 'es', 'fr', 'de'],
		});
	});

	// ─── PubSub/notification WebSocket pattern ──────────────────────
	// Some sites use a secondary WebSocket for push notifications,
	// events, or state updates (separate from the main data WS).
	// This is registered as a WS route in the test server index.
	// Agents should discover it via preconnect hints or JS bundle search.

	// ─── GraphQL subscription pattern ───────────────────────────────
	// Some sites use WebSocket for GraphQL subscriptions (real-time
	// updates over a persistent connection). The transport is
	// "graphql-ws" protocol over WebSocket, not standard JSON frames.
	// Agents should identify this from JS bundles containing
	// "graphql_subscription" or "graphql-ws" protocol strings.

	// ─── FormData POST pattern (multipart search) ──────────────────
	// Some sites send search requests as FormData (multipart/form-data)
	// instead of JSON body. The Content-Type is different and the body
	// must be constructed with FormData, not JSON.stringify.
	app.post('/search/form', async (c) => {
		const contentType = c.req.header('content-type') ?? '';

		let query = '';
		if (
			contentType.includes('multipart/form-data') ||
			contentType.includes('application/x-www-form-urlencoded')
		) {
			const body = await c.req.parseBody();
			query = (body.query as string) ?? (body.q as string) ?? '';
		} else {
			const body = (await c.req.json().catch(() => ({}))) as { query?: string };
			query = body.query ?? '';
		}

		if (!query) return c.json({ error: 'query field required' }, 400);

		const results = PRODUCTS.filter(
			(p) =>
				p.name.toLowerCase().includes(query.toLowerCase()) ||
				p.brand.toLowerCase().includes(query.toLowerCase()),
		).slice(0, 20);

		return c.json({
			query,
			results: results.map((p) => ({
				sku: p.sku,
				name: p.name,
				brand: p.brand,
				price: p.price,
				category: p.category,
			})),
			totalCount: results.length,
		});
	});

	// ─── RSS/XML feed pattern ───────────────────────────────────────
	// Many sites expose RSS feeds discoverable from <link rel="alternate">
	// in the HTML. Returns XML with <item> elements containing structured data.
	app.get('/rss', (c) => {
		const page1 = getProductPage(1, 10);
		const items = page1.items
			.map(
				(p) =>
					`  <item>
    <title>${p.name}</title>
    <link>http://localhost:4444/sites/boardshop/product/${p.sku}</link>
    <description>${p.brand} ${p.category} - $${p.price.toFixed(2)}</description>
    <pubDate>${new Date().toUTCString()}</pubDate>
    <guid>${p.sku}</guid>
  </item>`,
			)
			.join('\n');

		const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>BoardShop New Arrivals</title>
  <link>http://localhost:4444/sites/boardshop</link>
  <description>Latest skateboard products</description>
${items}
</channel>
</rss>`;

		c.header('Content-Type', 'application/rss+xml; charset=utf-8');
		return c.text(xml);
	});

	// ─── Pure SSR HTML table pattern ────────────────────────────────
	// Server-rendered page with NO embedded JSON, NO framework markers.
	// Data is only in HTML tables. Agents must classify as SSR and use
	// HTML parsing (cheerio or regex) to extract structured data.
	app.get('/ssr', (c) => {
		const page1 = getProductPage(1, MAX_PAGE_SIZE);
		const rows = page1.items
			.map(
				(p) =>
					`<tr class="product-row" data-sku="${p.sku}">
  <td class="name">${p.name}</td>
  <td class="brand">${p.brand}</td>
  <td class="category">${p.category}</td>
  <td class="price">$${p.price.toFixed(2)}</td>
  <td class="stock">${p.stock}</td>
  <td class="rating">${p.rating}/5</td>
</tr>`,
			)
			.join('\n');

		const html = `<!DOCTYPE html>
<html><head><title>BoardShop — Product Catalog</title></head>
<body>
<h1>Product Catalog</h1>
<p>Showing ${page1.items.length} of ${page1.totalCount} products</p>
<table id="product-table">
<thead><tr><th>Name</th><th>Brand</th><th>Category</th><th>Price</th><th>Stock</th><th>Rating</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<a href="/sites/boardshop/ssr?page=2" rel="next">Next Page →</a>
<link rel="alternate" type="application/rss+xml" title="BoardShop RSS" href="/sites/boardshop/rss">
</body></html>`;

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ═══════════════════════════════════════════════════════════════════
	// SESSION HARVESTER — Pattern A: Pro Drops (httpOnly cookie + correlation header)
	// httpOnly cookie + correlation header + embedded API keys
	// ═══════════════════════════════════════════════════════════════════

	// In-memory store for drop sessions (maps drop-session cookie → true)
	const dropSessions = new Set<string>();

	// GET /drops — HTML page with embedded pro drops + sets httpOnly cookie
	app.get('/drops', (c) => {
		const sessionToken = randomUUID();
		dropSessions.add(sessionToken);

		const dropsData = {
			drops: PRO_DROPS,
			totalCount: PRO_DROPS.length,
			nextDropDate: '2026-04-01',
		};

		const apiKey = 'sk_drops_xxx';
		const apiSecret = 'sk_drops_secret_yyy';

		const html = renderEmbeddedPage({
			title: 'BoardShop — Pro Drops',
			dataScripts: [{ id: 'drops-data', data: dropsData }],
			windowGlobals: {
				__DROPS_CONFIG__: { apiKey, apiSecret },
			},
			bodyHtml: `<section data-testid="drops-grid">
${PRO_DROPS.slice(0, 6)
	.map(
		(d) =>
			`<div data-testid="drop-card" data-drop-id="${d.dropId}"><h3>${d.deckName}</h3><p>${d.proSkater}</p><p>$${d.retailPrice.toFixed(2)}</p></div>`,
	)
	.join('\n')}
</section>`,
		});

		// Set httpOnly cookie — cannot be read by JavaScript, only sent by browser
		c.header('Set-Cookie', `drop-session=${sessionToken}; Path=/drops; HttpOnly; SameSite=Lax`);
		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// GET /drops/api/inventory — paginated inventory, requires session cookie + header
	app.get('/drops/api/inventory', (c) => {
		// Check httpOnly cookie
		const dropSession = c.req.header('cookie')?.match(/drop-session=([^;]+)/)?.[1];
		if (!dropSession || !dropSessions.has(dropSession)) {
			return c.json({ error: 'Forbidden — valid drop-session cookie required' }, 403);
		}

		// Check correlation header (like TM's tmps-correlation-id)
		const dropRequest = c.req.header('x-drop-request');
		if (!dropRequest) {
			return c.json({ error: 'Bad Request — x-drop-request header required' }, 400);
		}

		const deckId = c.req.query('deckId');
		if (!deckId) {
			return c.json({ error: 'Bad Request — deckId query param required' }, 400);
		}

		const limit = Math.min(Number(c.req.query('limit') ?? '20'), 20);
		const offset = Number(c.req.query('offset') ?? '0');

		const result = getDropInventoryPage(deckId, limit, offset);
		return c.json(result);
	});

	// ═══════════════════════════════════════════════════════════════════
	// SESSION HARVESTER — Pattern B: Resale Market (WAF + session cookies + POST)
	// WAF cookie + session cookies + POST pagination
	// ═══════════════════════════════════════════════════════════════════

	// In-memory store for resale sessions
	const resaleSessions = new Map<string, { sid: string; pref: string }>();

	// GET /resale — HTML page with first 6 listings + sets multiple cookies
	app.get('/resale', (_c) => {
		const wafToken = randomUUID();
		const sid = randomUUID();
		const pref = 'grid-view=true&currency=USD';

		resaleSessions.set(wafToken, { sid, pref });

		const firstPage = getResaleListingsPage(6, 1);

		const html = renderEmbeddedPage({
			title: 'BoardShop — Resale Market',
			dataScripts: [
				{ id: 'market-data', data: { listings: firstPage.items, total: firstPage.total } },
			],
			bodyHtml: `<section data-testid="resale-grid">
${firstPage.items.map((l) => `<div data-testid="listing-card" data-listing-id="${l.listingId}"><h3>${l.deckName}</h3><p>${l.brand} (${l.year})</p><p>$${l.askingPrice.toFixed(2)} — ${l.condition}</p></div>`).join('\n')}
</section>
<div data-testid="load-more">
<button data-action="load-more">Load More Listings</button>
<p data-testid="remaining">${firstPage.total - firstPage.items.length} more listings available</p>
</div>
<script>
(function() {
  var page = 2;
  var btn = document.querySelector('[data-action="load-more"]');
  if (!btn) return;
  btn.addEventListener('click', function() {
    fetch('/sites/boardshop/resale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Method: 'LoadMoreListings', PageSize: 10, CurrentPage: page, SortBy: 'price' })
    }).then(function(r) { return r.json(); }).then(function(data) {
      var grid = document.querySelector('[data-testid="resale-grid"]');
      for (var i = 0; i < data.items.length; i++) {
        var item = data.items[i];
        var el = document.createElement('div');
        el.dataset.testid = 'listing-card';
        el.innerHTML = '<h3>' + item.deckName + '</h3><p>' + item.brand + ' (' + item.year + ')</p><p>$' + item.askingPrice.toFixed(2) + ' - ' + item.condition + '</p>';
        grid.appendChild(el);
      }
      page++;
      if (!data.hasMore) btn.style.display = 'none';
      var rem = document.querySelector('[data-testid="remaining"]');
      if (rem) rem.textContent = (data.total - (page - 1) * 10) + ' more listings available';
    });
  });
})();
</script>`,
		});

		// Set multiple cookies — all are needed for full data access
		// Construct Response manually to correctly emit multiple Set-Cookie headers
		// (Hono's c.header() and c.html() don't reliably preserve multiple Set-Cookie)
		const headers = new Headers();
		headers.set('Content-Type', 'text/html; charset=utf-8');
		headers.append('Set-Cookie', `market-waf=${wafToken}; Path=/resale; SameSite=Lax`);
		headers.append('Set-Cookie', `market-sid=${sid}; Path=/resale; SameSite=Lax`);
		headers.append(
			'Set-Cookie',
			`market-pref=${encodeURIComponent(pref)}; Path=/resale; SameSite=Lax`,
		);
		return new Response(html, { status: 200, headers });
	});

	// POST /resale — paginated listings, requires WAF + session cookies
	app.post('/resale', async (c) => {
		// Check Content-Type
		const contentType = c.req.header('content-type') ?? '';
		if (!contentType.includes('application/json')) {
			return c.json({ error: 'Unsupported Media Type — application/json required' }, 415);
		}

		// Check WAF cookie (gate)
		const wafToken = c.req.header('cookie')?.match(/market-waf=([^;]+)/)?.[1];
		if (!wafToken || !resaleSessions.has(wafToken)) {
			return c.json({ error: 'Forbidden — WAF challenge not passed' }, 403);
		}

		// Check session cookie — WAF passes but data requires session
		const sidCookie = c.req.header('cookie')?.match(/market-sid=([^;]+)/)?.[1];
		// biome-ignore lint/style/noNonNullAssertion: checked has() above
		const session = resaleSessions.get(wafToken)!;
		if (!sidCookie || sidCookie !== session.sid) {
			// SH behavior: WAF passes, but without session → empty data
			return c.json({ items: [], total: 0, hasMore: false, currentPage: 1 });
		}

		const body = (await c.req.json()) as {
			Method?: string;
			PageSize?: number;
			CurrentPage?: number;
			SortBy?: string;
		};

		if (body.Method !== 'LoadMoreListings') {
			return c.json({ error: `Unknown method: ${body.Method}` }, 400);
		}

		const pageSize = body.PageSize ?? 10;
		const currentPage = body.CurrentPage ?? 1;
		const sortBy = body.SortBy;

		const result = getResaleListingsPage(pageSize, currentPage, sortBy);
		return c.json(result);
	});

	// ═══════════════════════════════════════════════════════════════════
	// COLLECTION JS BUNDLE — Contains the price decoder function
	// Agent must find this bundle (referenced in collection page HTML)
	// and read it to discover how to decode opaque price strings.
	// ═══════════════════════════════════════════════════════════════════

	app.get('/js/collection-loader.js', (c) => {
		// This JS bundle contains the price decoder that agents must discover.
		// The encoding: each digit 0-9 maps to A-J. "FBJJ" = 5149 = $51.49
		const js = `
(function() {
  "use strict";

  // Price decoder — converts encoded amount strings to numeric cents
  // Encoding scheme: digit 0-9 mapped to char A-J (offset 65)
  function _decodePriceAmount(e) {
    var n = "";
    for (var i = 0; i < e.length; i++) {
      n += String(e.charCodeAt(i) - 65);
    }
    return parseInt(n, 10);
  }

  // Format cents to display string
  function _formatPrice(cents, currency) {
    var prefix = currency === "USD" ? "$" : currency;
    return prefix + (cents / 100).toFixed(2);
  }

  // Render a listing card from API pick + embedded pricing
  function _renderListingCard(pick, pricing) {
    var p = pricing[pick.priceRef];
    if (!p) return null;
    var priceCents = _decodePriceAmount(p.amount);
    var feesCents = _decodePriceAmount(p.fees);
    var totalCents = priceCents + feesCents;
    var el = document.createElement("div");
    el.dataset.testid = "listing-card";
    el.dataset.listingId = pick.listingId;
    el.dataset.priceRef = pick.priceRef;
    el.innerHTML = '<h3 data-testid="deck-name">' + pick.deckName + '</h3>'
      + '<p data-testid="deck-details">' + pick.colorway + ' \\u00b7 ' + pick.condition + ' \\u00b7 Qty: ' + pick.availableQty + '</p>'
      + '<span data-testid="listing-price">' + _formatPrice(priceCents, p.currency) + '</span>'
      + '<span data-testid="listing-fees">+ ' + _formatPrice(feesCents, p.currency) + ' fees</span>'
      + '<span data-testid="listing-total">' + _formatPrice(totalCents, p.currency) + ' total</span>'
      + '<span data-testid="seller-tier">' + pick.sellerTier + '</span>';
    return el;
  }

  // Initialize "See More" loader
  var init = window.__COLLECTION_INIT__;
  if (!init) return;
  var offset = init.offset;
  var total = init.total;
  var cfg = window.__COLLECTION_CONFIG__;
  if (!cfg) return;

  var btn = document.querySelector('[data-testid="see-more-btn"]');
  if (!btn) return;

  btn.addEventListener("click", function() {
    var url = cfg.listingsEndpoint + "?limit=20&offset=" + offset
      + "&sort=price&apikey=" + cfg.apiKey + "&apisecret=" + cfg.apiSecret;
    fetch(url).then(function(r) { return r.json(); }).then(function(data) {
      var grid = document.querySelector('[data-testid="listings-grid"]');
      for (var i = 0; i < data.picks.length; i++) {
        var card = _renderListingCard(data.picks[i], data._embedded.pricing);
        if (card) grid.appendChild(card);
      }
      offset += data.picks.length;
      if (!data.hasMore) btn.style.display = "none";
      var rem = document.querySelector('[data-testid="remaining-count"]');
      if (rem) rem.textContent = (total - offset) + " more available";
    });
  });

  // Also support infinite scroll
  var scrollLoading = false;
  window.addEventListener("scroll", function() {
    if (scrollLoading) return;
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
      scrollLoading = true;
      btn.click();
      setTimeout(function() { scrollLoading = false; }, 500);
    }
  });
})();
`;
		c.header('Content-Type', 'application/javascript; charset=utf-8');
		c.header('Cache-Control', 'public, max-age=31536000');
		return c.body(js);
	});

	// ═══════════════════════════════════════════════════════════════════
	// COLLECTION DETAIL — Encoded pricing + paginated listings
	// Collection detail page with encoded pricing + paginated listings.
	// Page renders decoded prices ($XX.XX), API returns encoded price refs.
	// Pattern: navigate to detail → notice partial data → decode prices → paginate.
	// ═══════════════════════════════════════════════════════════════════

	const collectionSessions = new Set<string>();

	// GET /collection/:id — Detail page with first 8 listings (decoded prices in HTML)
	app.get('/collection/:id', (c) => {
		const collectionId = c.req.param('id');
		const col = COLLECTIONS.find((col) => col.collectionId === collectionId);
		if (!col) {
			c.header('Content-Type', 'text/html; charset=utf-8');
			return c.html('<html><body><h1>Collection not found</h1></body></html>', 404);
		}

		// Set httpOnly session cookie for API access
		const sessionToken = randomUUID();
		collectionSessions.add(sessionToken);

		// Get first 8 listings for embedded preview
		const allForCollection = COLLECTION_LISTINGS.filter((l) => l.collectionId === collectionId);
		const preview = allForCollection.slice(0, 8);
		const pricing = buildPricingEmbedded(preview);

		// Embedded data uses encoded format (priceRef + _embedded.pricing)
		const embeddedData = {
			collection: {
				...col,
				listingCount: allForCollection.length,
			},
			listings: preview.map(({ _priceCents, _feesCents, ...rest }) => rest),
			_embedded: { pricing },
			pagination: {
				total: allForCollection.length,
				showing: preview.length,
				hasMore: allForCollection.length > preview.length,
				itemsRemaining: allForCollection.length - preview.length,
			},
		};

		// But the HTML renders DECODED prices (what the user sees)
		const listingCards = preview
			.map((l) => {
				const price = l._priceCents / 100;
				const fees = l._feesCents / 100;
				const total = price + fees;
				return `<div data-testid="listing-card" data-listing-id="${l.listingId}" data-price-ref="${l.priceRef}">
  <h3 data-testid="deck-name">${l.deckName}</h3>
  <p data-testid="deck-details">${l.colorway} · ${l.condition} · Qty: ${l.availableQty}</p>
  <span data-testid="listing-price">$${price.toFixed(2)}</span>
  <span data-testid="listing-fees">+ $${fees.toFixed(2)} fees</span>
  <span data-testid="listing-total">$${total.toFixed(2)} total</span>
  <span data-testid="seller-tier">${l.sellerTier}</span>
</div>`;
			})
			.join('\n');

		const html = renderEmbeddedPage({
			title: `${col.name} — BoardShop`,
			dataScripts: [{ id: 'collection-data', data: embeddedData }],
			windowGlobals: {
				__COLLECTION_CONFIG__: {
					apiKey: 'ck_collection_live_xxx',
					apiSecret: 'cs_collection_live_yyy',
					listingsEndpoint: `/sites/boardshop/api/collection/${collectionId}/listings`,
				},
			},
			metaTags: [{ name: 'collection-id', content: collectionId }],
			bodyHtml: `
<nav data-testid="breadcrumb">
  <a href="/sites/boardshop">BoardShop</a> › <a href="/sites/boardshop/collections">Collections</a> › ${col.name}
</nav>
<header data-testid="collection-header">
  <h1>${col.name}</h1>
  <p>${col.description}</p>
  <p data-testid="listing-count">${allForCollection.length} decks available</p>
</header>
<section data-testid="listings-grid">
${listingCards}
</section>
<div data-testid="load-more-section">
  <button data-testid="see-more-btn" data-action="load-more">See More Decks</button>
  <p data-testid="remaining-count">${allForCollection.length - preview.length} more available</p>
</div>
<script src="/sites/boardshop/js/collection-loader.js"></script>
<script>
window.__COLLECTION_INIT__ = { offset: ${preview.length}, total: ${allForCollection.length}, collectionId: '${collectionId}' };
</script>`,
		});

		c.header('Set-Cookie', `listing-session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`);
		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// GET /collections — Browse all collections (list page with links to detail)
	app.get('/collections', (c) => {
		const collectionCards = COLLECTIONS.map((col) => {
			const count = COLLECTION_LISTINGS.filter((l) => l.collectionId === col.collectionId).length;
			return `<a href="/sites/boardshop/collection/${col.collectionId}" data-testid="collection-link" data-collection-id="${col.collectionId}">
  <div data-testid="collection-card">
    <h2>${col.name}</h2>
    <p>${col.brand} · ${count} decks</p>
    <p>${col.description}</p>
  </div>
</a>`;
		}).join('\n');

		const html = renderEmbeddedPage({
			title: 'Collections — BoardShop',
			dataScripts: [
				{
					id: 'collections-data',
					data: { collections: COLLECTIONS, totalCollections: COLLECTIONS.length },
				},
			],
			bodyHtml: `
<nav data-testid="breadcrumb">
  <a href="/sites/boardshop">BoardShop</a> › Collections
</nav>
<h1>Deck Collections</h1>
<p data-testid="collection-count">${COLLECTIONS.length} collections available</p>
<section data-testid="collections-grid">
${collectionCards}
</section>`,
		});

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// GET /api/collection/:id/listings — Paginated listings with encoded pricing
	// Requires httpOnly listing-session cookie + apikey/apisecret query params
	app.get('/api/collection/:id/listings', (c) => {
		const collectionId = c.req.param('id');

		// Check httpOnly session cookie
		const sessionCookie = c.req.header('cookie')?.match(/listing-session=([^;]+)/)?.[1];
		if (!sessionCookie || !collectionSessions.has(sessionCookie)) {
			return c.json({ error: 'Unauthorized — valid listing-session cookie required' }, 401);
		}

		// Check API key (embedded in page as window.__COLLECTION_CONFIG__)
		const apikey = c.req.query('apikey');
		const apisecret = c.req.query('apisecret');
		if (apikey !== 'ck_collection_live_xxx' || apisecret !== 'cs_collection_live_yyy') {
			return c.json({ error: 'Forbidden — invalid API credentials' }, 403);
		}

		const limit = Math.min(Number(c.req.query('limit') ?? '20'), 20);
		const offset = Number(c.req.query('offset') ?? '0');
		const sort = c.req.query('sort');

		const result = getCollectionListingsPage(collectionId, limit, offset, sort);
		return c.json(result);
	});

	return app;
}
