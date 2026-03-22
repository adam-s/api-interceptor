import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
	DROP_INVENTORY,
	MAX_PAGE_SIZE,
	PRO_DROPS,
	PRODUCTS,
	RESALE_LISTINGS,
} from '../data/products';
import { createTestServer, type TestServerInstance } from '../index';

let server: TestServerInstance;
let baseUrl: string;

beforeAll(async () => {
	server = await createTestServer({ port: 0 });
	baseUrl = `${server.url}/sites/boardshop`;
});

afterAll(async () => {
	await server.close();
});

describe('boardshop site', () => {
	test('page source contains embedded JSON with products', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		expect(html).toContain('<script id="catalog-data" type="application/json">');
		expect(html).toContain('DECK-001');

		// Extract and parse the embedded JSON
		const match = html.match(/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s);
		expect(match).toBeTruthy();
		const data = JSON.parse(match![1]);
		expect(data.catalog.items.length).toBe(MAX_PAGE_SIZE);
		expect(data.catalog.totalCount).toBe(PRODUCTS.length);
		expect(data.catalog.currentPage).toBe(1);
	});

	test('embedded JSON has filterSessionId and csrf token', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		// filterSessionId in embedded JSON
		const match = html.match(/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s);
		const data = JSON.parse(match![1]);
		expect(data.catalog.filterSessionId).toBeTruthy();

		// CSRF in hidden input
		expect(html).toMatch(/<input type="hidden" id="csrf-token"/);
		const csrfMatch = html.match(/id="csrf-token"[^>]*value="([^"]+)"/);
		expect(csrfMatch![1]).toBeTruthy();

		// Window global with session
		expect(html).toContain('window.__SESSION__');

		// Meta tag with API key
		expect(html).toContain('pk_test_boardshop_abc123');
	});

	test('POST pagination returns next page with correct items', async () => {
		// First, GET the page to establish session + get tokens
		const pageRes = await fetch(baseUrl);
		const html = await pageRes.text();
		const cookie = pageRes.headers.get('set-cookie')!;
		const sid = cookie.match(/_sid=([^;]+)/)?.[1];

		const catalogMatch = html.match(
			/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s,
		);
		const catalogData = JSON.parse(catalogMatch![1]);
		const filterSessionId = catalogData.catalog.filterSessionId;

		const csrfMatch = html.match(/id="csrf-token"[^>]*value="([^"]+)"/);
		const csrf = csrfMatch![1];

		// POST for page 2
		const res = await fetch(baseUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `_sid=${sid}`,
			},
			body: JSON.stringify({ page: 2, pageSize: MAX_PAGE_SIZE, filterSessionId, csrf }),
		});

		const data = await res.json();
		// POST response is FLATTER — items at top level, not nested under catalog
		expect(data.items.length).toBe(MAX_PAGE_SIZE);
		expect(data.remaining).toBeGreaterThan(0);
		expect(data.currentPage).toBe(2);
		// Items should be different from page 1
		expect(data.items[0].sku).not.toBe(catalogData.catalog.items[0].sku);
	});

	test('pageSize > MAX returns empty items (silent fail)', async () => {
		const pageRes = await fetch(baseUrl);
		const html = await pageRes.text();
		const cookie = pageRes.headers.get('set-cookie')!;
		const sid = cookie.match(/_sid=([^;]+)/)?.[1];
		const catalogMatch = html.match(
			/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s,
		);
		const catalogData = JSON.parse(catalogMatch![1]);
		const csrfMatch = html.match(/id="csrf-token"[^>]*value="([^"]+)"/);

		const res = await fetch(baseUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: `_sid=${sid}` },
			body: JSON.stringify({
				page: 1,
				pageSize: 100, // Over MAX_PAGE_SIZE
				filterSessionId: catalogData.catalog.filterSessionId,
				csrf: csrfMatch![1],
			}),
		});

		const data = await res.json();
		expect(data.items).toEqual([]); // Silent fail — empty, no error
	});

	test('CSRF token from hidden input is required for POST', async () => {
		const pageRes = await fetch(baseUrl);
		const cookie = pageRes.headers.get('set-cookie')!;
		const sid = cookie.match(/_sid=([^;]+)/)?.[1];

		// POST without CSRF → 403
		const res = await fetch(baseUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Cookie: `_sid=${sid}` },
			body: JSON.stringify({ page: 2, pageSize: 20, filterSessionId: 'whatever', csrf: 'wrong' }),
		});

		expect(res.status).toBe(403);
	});

	test('cursor pagination returns hasNextPage and endCursor', async () => {
		const res = await fetch(`${baseUrl}/reviews`);
		const data = await res.json();

		expect(data.items.length).toBeGreaterThan(0);
		expect(data.pageInfo.hasNextPage).toBe(true);
		expect(data.pageInfo.endCursor).toBeTruthy();

		// Fetch next page using cursor
		const res2 = await fetch(`${baseUrl}/reviews?after=${data.pageInfo.endCursor}`);
		const data2 = await res2.json();

		expect(data2.items.length).toBeGreaterThan(0);
		expect(data2.items[0].id).not.toBe(data.items[0].id);
	});

	test('HTML has custom elements matching JSON data', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		// Custom elements with data attributes
		expect(html).toContain('<board-price');
		expect(html).toContain('data-field="price"');
		expect(html).toContain('data-sku="DECK-001"');
		expect(html).toContain('data-testid="product-card"');
		expect(html).toContain('data-testid="product-grid"');

		// Verify data-value matches embedded JSON
		const priceMatch = html.match(/data-sku="DECK-001" data-field="price" data-value="([^"]+)"/);
		const catalogMatch = html.match(
			/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s,
		);
		const catalogData = JSON.parse(catalogMatch![1]);
		const deck001 = catalogData.catalog.items.find((i: { sku: string }) => i.sku === 'DECK-001');
		expect(priceMatch![1]).toBe(String(deck001.price));
	});

	test('product detail page has embedded product data', async () => {
		const res = await fetch(`${baseUrl}/product/DECK-001`);
		const html = await res.text();

		expect(html).toContain('<script id="product-data" type="application/json">');
		const match = html.match(/<script id="product-data" type="application\/json">(.+?)<\/script>/s);
		const data = JSON.parse(match![1]);
		expect(data.product.sku).toBe('DECK-001');
		expect(data.product.price).toBeGreaterThan(0);
		expect(data.relatedSkus.length).toBeGreaterThan(0);
	});

	test('API endpoint requires API key from meta tag', async () => {
		// Without key → 401
		const res1 = await fetch(`${baseUrl}/api/products`);
		expect(res1.status).toBe(401);

		// With key → 200
		const res2 = await fetch(`${baseUrl}/api/products`, {
			headers: { 'X-API-Key': 'pk_test_boardshop_abc123' },
		});
		expect(res2.status).toBe(200);
		const data = await res2.json();
		expect(data.items.length).toBeGreaterThan(0);
	});

	// ═══════════════════════════════════════════════════════════════════
	// SESSION HARVESTER — Pattern A: Pro Drops (httpOnly cookie + correlation header)
	// ═══════════════════════════════════════════════════════════════════

	test('pro drops page sets httpOnly drop-session cookie', async () => {
		const res = await fetch(`${baseUrl}/drops`);
		expect(res.status).toBe(200);
		const html = await res.text();

		// Check httpOnly cookie is set
		const setCookie = res.headers.get('set-cookie');
		expect(setCookie).toBeTruthy();
		expect(setCookie).toContain('drop-session=');
		expect(setCookie).toContain('HttpOnly');

		// Check embedded JSON with drops data
		expect(html).toContain('<script id="drops-data" type="application/json">');
		const match = html.match(/<script id="drops-data" type="application\/json">(.+?)<\/script>/s);
		expect(match).toBeTruthy();
		const data = JSON.parse(match![1]);
		expect(data.drops.length).toBe(PRO_DROPS.length);

		// Check window global with API keys
		expect(html).toContain('window.__DROPS_CONFIG__');
		expect(html).toContain('sk_drops_xxx');
	});

	test('drops inventory returns 403 without cookie, 400 without header, 200 with both', async () => {
		// Step 1: No cookie → 403
		const res1 = await fetch(`${baseUrl}/drops/api/inventory?deckId=DROP-001&limit=20&offset=0`);
		expect(res1.status).toBe(403);

		// Step 2: Get the cookie by visiting the drops page
		const pageRes = await fetch(`${baseUrl}/drops`);
		const setCookie = pageRes.headers.get('set-cookie')!;
		const dropSession = setCookie.match(/drop-session=([^;]+)/)?.[1];
		expect(dropSession).toBeTruthy();

		// Step 3: Cookie but no header → 400
		const res2 = await fetch(`${baseUrl}/drops/api/inventory?deckId=DROP-001&limit=20&offset=0`, {
			headers: { Cookie: `drop-session=${dropSession}` },
		});
		expect(res2.status).toBe(400);

		// Step 4: Both cookie and header → 200
		const res3 = await fetch(`${baseUrl}/drops/api/inventory?deckId=DROP-001&limit=20&offset=0`, {
			headers: {
				Cookie: `drop-session=${dropSession}`,
				'x-drop-request': 'test-correlation-id',
			},
		});
		expect(res3.status).toBe(200);
		const data = await res3.json();
		expect(data.items.length).toBeGreaterThan(0);
		expect(data.items[0].deckId).toBe('DROP-001');
	});

	test('drops inventory paginates across all items for a deckId', async () => {
		// Get session
		const pageRes = await fetch(`${baseUrl}/drops`);
		const dropSession = pageRes.headers
			.get('set-cookie')
			?.match(/drop-session=([^;]+)/)?.[1] as string;

		const headers = {
			Cookie: `drop-session=${dropSession}`,
			'x-drop-request': 'pagination-test',
		};

		// Each drop has 4 sizes × 4 colorways = 16 items
		const expectedTotal = DROP_INVENTORY.filter((i) => i.deckId === 'DROP-001').length;

		// Page 1
		const res1 = await fetch(`${baseUrl}/drops/api/inventory?deckId=DROP-001&limit=10&offset=0`, {
			headers,
		});
		const page1 = await res1.json();
		expect(page1.items.length).toBe(10);
		expect(page1.total).toBe(expectedTotal);
		expect(page1.hasMore).toBe(true);

		// Page 2
		const res2 = await fetch(`${baseUrl}/drops/api/inventory?deckId=DROP-001&limit=10&offset=10`, {
			headers,
		});
		const page2 = await res2.json();
		expect(page2.items.length).toBe(expectedTotal - 10);
		expect(page2.hasMore).toBe(false);

		// Items should be different
		expect(page2.items[0].colorway).not.toBe(page1.items[0].colorway);
	});

	// ═══════════════════════════════════════════════════════════════════
	// SESSION HARVESTER — Pattern B: Resale Market (WAF + session cookies + POST)
	// ═══════════════════════════════════════════════════════════════════

	test('resale page sets market-waf + market-sid cookies', async () => {
		const res = await fetch(`${baseUrl}/resale`);
		expect(res.status).toBe(200);
		const html = await res.text();

		// Check all cookies are set
		const setCookies = res.headers.getSetCookie();
		const cookieNames = setCookies.map((c) => c.split('=')[0]);
		expect(cookieNames).toContain('market-waf');
		expect(cookieNames).toContain('market-sid');
		expect(cookieNames).toContain('market-pref');

		// Check embedded JSON
		expect(html).toContain('<script id="market-data" type="application/json">');
		const match = html.match(/<script id="market-data" type="application\/json">(.+?)<\/script>/s);
		const data = JSON.parse(match![1]);
		expect(data.listings.length).toBe(6); // First page only
		expect(data.total).toBe(RESALE_LISTINGS.length);
	});

	test('resale POST returns 403 without WAF, empty without SID, data with both', async () => {
		const postBody = JSON.stringify({
			Method: 'LoadMoreListings',
			PageSize: 10,
			CurrentPage: 2,
			SortBy: 'price',
		});

		// Step 1: No cookies → 403
		const res1 = await fetch(`${baseUrl}/resale`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: postBody,
		});
		expect(res1.status).toBe(403);

		// Step 2: Get cookies from page
		const pageRes = await fetch(`${baseUrl}/resale`);
		const setCookies = pageRes.headers.getSetCookie();
		const wafToken = setCookies
			.find((c) => c.startsWith('market-waf='))
			?.match(/market-waf=([^;]+)/)?.[1];
		const sidToken = setCookies
			.find((c) => c.startsWith('market-sid='))
			?.match(/market-sid=([^;]+)/)?.[1];
		expect(wafToken).toBeTruthy();
		expect(sidToken).toBeTruthy();

		// Step 3: WAF cookie only → 200 but empty items (SH behavior)
		const res2 = await fetch(`${baseUrl}/resale`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `market-waf=${wafToken}`,
			},
			body: postBody,
		});
		expect(res2.status).toBe(200);
		const emptyData = await res2.json();
		expect(emptyData.items).toEqual([]);

		// Step 4: Both WAF + SID cookies → 200 with data
		const res3 = await fetch(`${baseUrl}/resale`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `market-waf=${wafToken}; market-sid=${sidToken}`,
			},
			body: postBody,
		});
		expect(res3.status).toBe(200);
		const data = await res3.json();
		expect(data.items.length).toBe(10);
		expect(data.currentPage).toBe(2);
	});

	test('resale POST requires application/json content-type (415 without)', async () => {
		// Get cookies
		const pageRes = await fetch(`${baseUrl}/resale`);
		const setCookies = pageRes.headers.getSetCookie();
		const wafToken = setCookies
			.find((c) => c.startsWith('market-waf='))
			?.match(/market-waf=([^;]+)/)?.[1];
		const sidToken = setCookies
			.find((c) => c.startsWith('market-sid='))
			?.match(/market-sid=([^;]+)/)?.[1];

		const res = await fetch(`${baseUrl}/resale`, {
			method: 'POST',
			headers: {
				Cookie: `market-waf=${wafToken}; market-sid=${sidToken}`,
			},
			body: JSON.stringify({ Method: 'LoadMoreListings', PageSize: 10, CurrentPage: 1 }),
		});
		expect(res.status).toBe(415);
	});

	test('resale full pagination collects all 60 listings', async () => {
		// Get cookies
		const pageRes = await fetch(`${baseUrl}/resale`);
		const setCookies = pageRes.headers.getSetCookie();
		const wafToken = setCookies
			.find((c) => c.startsWith('market-waf='))
			?.match(/market-waf=([^;]+)/)?.[1];
		const sidToken = setCookies
			.find((c) => c.startsWith('market-sid='))
			?.match(/market-sid=([^;]+)/)?.[1];

		const headers = {
			'Content-Type': 'application/json',
			Cookie: `market-waf=${wafToken}; market-sid=${sidToken}`,
		};

		const allItems: unknown[] = [];
		let page = 1;
		let hasMore = true;

		while (hasMore && page <= 10) {
			const res = await fetch(`${baseUrl}/resale`, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					Method: 'LoadMoreListings',
					PageSize: 10,
					CurrentPage: page,
					SortBy: 'price',
				}),
			});
			const data = await res.json();
			allItems.push(...data.items);
			hasMore = data.hasMore;
			page++;
		}

		expect(allItems.length).toBe(RESALE_LISTINGS.length);
	});
});
