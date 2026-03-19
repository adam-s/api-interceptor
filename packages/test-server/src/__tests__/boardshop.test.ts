import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, type TestServerInstance } from '../index';
import { MAX_PAGE_SIZE, PRODUCTS } from '../data/products';

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

		const catalogMatch = html.match(/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s);
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
		const catalogMatch = html.match(/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s);
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
		const catalogMatch = html.match(/<script id="catalog-data" type="application\/json">(.+?)<\/script>/s);
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
});
