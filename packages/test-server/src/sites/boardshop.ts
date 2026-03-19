/**
 * Boardshop Site — E-commerce fake website.
 *
 * Simulates StubHub-like patterns:
 * - Embedded JSON in <script id="catalog-data" type="application/json">
 * - POST pagination to same URL with CSRF + filterSessionId
 * - Silent page size limit (pageSize > 20 returns empty)
 * - Cursor-based pagination for reviews
 * - Custom DOM elements with data attributes
 * - Multiple auth token sources (hidden input, cookie, window global)
 */

import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { PRODUCTS, getProductPage, getReviewsCursor, MAX_PAGE_SIZE } from '../data/products';
import { renderEmbeddedPage } from '../transports/embedded-html';

// In-memory session store for CSRF tokens
const sessions = new Map<string, { csrf: string; filterSessionId: string }>();

function getOrCreateSession(sessionId: string | undefined): { sessionId: string; csrf: string; filterSessionId: string } {
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
		const category = c.req.query('category') as 'decks' | 'trucks' | 'wheels' | 'accessories' | undefined;
		const sessionCookie = c.req.header('cookie')?.match(/_sid=([^;]+)/)?.[1];
		const session = getOrCreateSession(sessionCookie);

		const page1 = getProductPage(1, MAX_PAGE_SIZE, category);

		// Filter by search query if provided
		const filteredItems = q
			? page1.items.filter((p) =>
					p.name.toLowerCase().includes(q.toLowerCase()) ||
					p.brand.toLowerCase().includes(q.toLowerCase()))
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
			.map((p) =>
				`<div data-testid="product-card" data-sku="${p.sku}">` +
				`<board-price data-sku="${p.sku}" data-field="price" data-value="${p.price}">$${p.price.toFixed(2)}</board-price>` +
				`<board-stock data-sku="${p.sku}" data-field="stock" data-value="${p.stock}">${p.stock} in stock</board-stock>` +
				`<board-rating data-sku="${p.sku}" data-field="rating" data-value="${p.rating}">${p.rating}/5</board-rating>` +
				`<span data-testid="product-name">${p.name}</span>` +
				`<span data-testid="product-brand">${p.brand}</span>` +
				`</div>`)
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
			hiddenInputs: [
				{ id: 'csrf-token', name: 'csrf-token', value: session.csrf },
			],
			metaTags: [
				{ name: 'api-key', content: 'pk_test_boardshop_abc123' },
			],
			bodyHtml: `<section data-testid="product-grid">\n${productElements}\n</section>`,
			cookies: [{ name: '_sid', value: session.sessionId, path: '/' }],
		});

		c.header('Set-Cookie', `_sid=${session.sessionId}; Path=/; SameSite=Lax`);
		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── POST pagination (same URL!) ────────────────────────────────
	app.post('/', async (c) => {
		const body = await c.req.json() as {
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
		const result = getProductPage(page, pageSize, body.category as 'decks' | 'trucks' | 'wheels' | 'accessories' | undefined);

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
				{ id: 'product-data', data: { product, relatedSkus: PRODUCTS.filter((p) => p.category === product.category && p.sku !== sku).slice(0, 4).map((p) => p.sku) } },
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
		const category = c.req.query('category') as 'decks' | 'trucks' | 'wheels' | 'accessories' | undefined;
		return c.json(getProductPage(page, pageSize, category));
	});

	return app;
}
