// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * BoardShop API Routes (Reference Example)
 *
 * Routes ordered LIGHTEST to HEAVIEST — prefer earlier patterns:
 *
 * BOARDSHOP ROUTES (target: localhost:4444/sites/boardshop):
 *  1. GET /catalog        — Embedded JSON: fetch HTML, parse <script> tag
 *  2. GET /product/:sku   — Embedded JSON: detail page, different script ID
 *  3. GET /shops          — Direct HTTP to JSON API
 *  4. GET /availability   — Escalation: rateLimitedFetch → browserFetch on 429
 *  5. POST /orders        — Typed API client with session auth
 *  6. GET /trending       — browserFetch to browser-proxied JSON API
 *  7. GET /search         — SSR DOM extraction (LAST RESORT)
 *  8. GET /boards/:sku    — Detail DOM extraction (LAST RESORT)
 *
 * CROSS-TRANSPORT EXAMPLES (target other test server sites):
 *  9. GET /graphql-example  — GraphQL query (streamshop)
 * 10. GET /hls-example      — HLS media stream chain (streamshop)
 * 11. GET /encoded-example  — Base64-encoded JSON API (databoard)
 * 12. GET /crumb-example    — REST API with crumb token auth (liveboard)
 *
 * All routes work against the test server (port 4444):
 *   pnpm --filter @interceptor/test-server start
 *   curl http://localhost:3001/api/boardshop/catalog
 *   curl http://localhost:3001/api/boardshop/graphql-example
 *
 * @module domain-boardshop/routes
 */

import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';
import { DEBUG, rateLimitedFetch } from '@interceptor/shared';
import { createOrder } from './api-client';
import { BoardShopSessionManager } from './session-manager';

/** Test server base URL. Override with BOARDSHOP_URL env var for real targets. */
const BASE_URL = process.env.BOARDSHOP_URL ?? 'http://localhost:4444/sites/boardshop';

export const routes: DomainRoute[] = [
	// ─── Route 1: Embedded JSON from HTML page (MOST COMMON PATTERN) ─────
	// Fetch the page HTML with rateLimitedFetch (no browser).
	// Find the <script id="catalog-data" type="application/json"> tag.
	// JSON.parse it. Return structured data. Done.
	{
		method: 'GET',
		path: '/catalog',
		description: 'Product catalog via embedded JSON extraction.',
		browserRequired: false,
		handler: async (c) => {
			const q = new URL(c.req.url).searchParams.get('q') ?? '';
			const url = `${BASE_URL}/${q ? `?q=${encodeURIComponent(q)}` : ''}`;

			DEBUG('boardshop', `catalog: fetching ${url}`);
			const res = await rateLimitedFetch(url);
			if (!res.ok) return c.json({ error: `Page returned ${res.status}` }, 502);
			const html = await res.text();
			DEBUG('boardshop', `catalog: HTML ${html.length} chars`);

			// Find embedded JSON — the script tag ID varies by site
			const match = html.match(
				/<script\s+id="catalog-data"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
			);
			if (!match) {
				DEBUG('boardshop', 'catalog: no catalog-data script tag found');
				return c.json({ error: 'Embedded JSON not found' }, 404);
			}

			const data = JSON.parse(match[1]) as {
				catalog: {
					items: unknown[];
					totalCount: number;
					pageSize: number;
					currentPage: number;
					filterSessionId: string;
					itemsRemaining: number;
				};
				searchQuery: string;
			};

			return c.json({
				items: data.catalog.items,
				total: data.catalog.totalCount,
				page: data.catalog.currentPage,
				pageSize: data.catalog.pageSize,
				remaining: data.catalog.itemsRemaining,
				query: data.searchQuery,
			});
		},
	},

	// ─── Route 2: Embedded JSON — Detail page (different script ID) ──────
	// Detail pages embed data in a DIFFERENT script tag than listing pages.
	// You must visit a detail page during discovery to find its tag ID.
	{
		method: 'GET',
		path: '/product/:sku',
		description: 'Product detail via embedded JSON extraction.',
		browserRequired: false,
		handler: async (c) => {
			const params = c.req.param() as Record<string, string>;
			const sku = params.sku;
			const url = `${BASE_URL}/product/${sku}`;

			DEBUG('boardshop', `product: fetching ${url}`);
			const res = await rateLimitedFetch(url);
			if (!res.ok) return c.json({ error: `Product page returned ${res.status}` }, 502);
			const html = await res.text();

			// Detail page uses "product-data" not "catalog-data"
			const match = html.match(
				/<script\s+id="product-data"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
			);
			if (!match) return c.json({ error: 'Product data not found' }, 404);

			const data = JSON.parse(match[1]) as {
				product: Record<string, unknown>;
				relatedSkus: string[];
			};

			return c.json(data);
		},
	},

	// ─── Route 3: Direct HTTP to JSON API ────────────────────────────────
	// When an endpoint returns JSON directly (not embedded in HTML).
	// Test every endpoint with curl first — most work without a browser.
	{
		method: 'GET',
		path: '/shops',
		description: 'List shops. Direct HTTP — no browser needed.',
		browserRequired: false,
		handler: async (c) => {
			const city = new URL(c.req.url).searchParams.get('city') ?? '';
			const url = `https://api.boardshop.example.com/v1/shops${city ? `?city=${encodeURIComponent(city)}` : ''}`;

			const res = await rateLimitedFetch(url, {
				headers: { Accept: 'application/json' },
			});

			if (!res.ok) {
				return c.json({ error: `Shop API returned ${res.status}` }, 502);
			}
			return c.json(await res.json());
		},
	},

	// ─── Route 4: Escalation (rateLimitedFetch → browserFetch) ───────────
	// Try direct HTTP first. If blocked (429/403), escalate to browserFetch.
	// NEVER use page.evaluate(fetch(...)) — browserFetch does the same thing.
	{
		method: 'GET',
		path: '/availability',
		description: 'Product availability. Direct HTTP, falls back to browserFetch if blocked.',
		handler: async (c, browser) => {
			const category = new URL(c.req.url).searchParams.get('category') ?? '';
			const url = `${BASE_URL}/api/availability${category ? `?category=${encodeURIComponent(category)}` : ''}`;

			// Step 1: Try direct HTTP
			const directRes = await rateLimitedFetch(url, {
				headers: { Accept: 'application/json' },
			});

			if (directRes.ok) {
				return c.json(await directRes.json());
			}

			// Step 2: If blocked, escalate to browserFetch (Chrome TLS + cookies)
			if (directRes.status === 429 || directRes.status === 403) {
				DEBUG(
					'boardshop',
					`availability: blocked (${directRes.status}), escalating to browserFetch`,
				);
				const browserRes = await browser.browserFetch<Record<string, unknown>>(url);
				return c.json(browserRes.data ?? { error: 'Browser fetch failed' });
			}

			return c.json({ error: `API returned ${directRes.status}` }, 502);
		},
	},

	// ─── Route 5: Typed API Client with Session Auth ─────────────────────
	{
		method: 'POST',
		path: '/orders',
		description: 'Create order. Uses typed API client + session auth.',
		browserRequired: false,
		handler: async (c) => {
			const manager = BoardShopSessionManager.getInstance();
			const headers = manager.getHeaders('boardshop');
			if (!headers) {
				return c.json({ error: 'Not authenticated. Connect browser to boardshop first.' }, 401);
			}

			const body = (await c.req.json()) as { sku: string; quantity: number };
			if (!body.sku || !body.quantity) {
				return c.json({ error: 'sku and quantity required' }, 400);
			}

			try {
				const order = await createOrder(headers, body);
				return c.json({ order });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return c.json({ error: msg }, 502);
			}
		},
	},

	// ─── Route 6: browserFetch to JSON API ───────────────────────────────
	// When the endpoint requires browser cookies/TLS that can't be replicated.
	{
		method: 'GET',
		path: '/trending',
		description: 'Trending boards. Proxies JSON API via browserFetch.',
		handler: async (c, browser) => {
			const maxItems = new URL(c.req.url).searchParams.get('limit') ?? '20';
			const result = await browser.browserFetch<Record<string, unknown>>(
				`https://www.boardshop.example.com/api/trending?limit=${maxItems}`,
				{ method: 'POST' },
			);
			const data = result.data ?? {};
			const items = (data.boards as unknown[]) ?? [];
			return c.json({ boards: items, total: items.length });
		},
	},

	// ─── Route 7: SSR DOM Extraction (LAST RESORT) ───────────────────────
	// Only use when Transport Classification proves no network request carries
	// the data. Requires SSR proof — classification (g) with validation gate.
	{
		method: 'GET',
		path: '/search',
		description: 'Search. SSR DOM extraction — last resort.',
		handler: async (c, browser) => {
			const q = new URL(c.req.url).searchParams.get('q') ?? '';
			if (!q) return c.json({ error: 'q param required' }, 400);

			const page = browser.getPage();
			if (!page) return c.json({ error: 'Browser page not available' }, 503);

			await browser.navigate(`https://www.boardshop.example.com/search?q=${encodeURIComponent(q)}`);
			await new Promise((r) => setTimeout(r, 4000));

			const boards = await page.evaluate(`
				(function() {
					var links = Array.from(document.querySelectorAll('a[href*="/board/"]'));
					var seen = {};
					var results = [];
					for (var i = 0; i < links.length; i++) {
						var el = links[i];
						var href = el.href;
						var skuMatch = href.match(/\\/board\\/([A-Za-z0-9-]+)/);
						var sku = skuMatch ? skuMatch[1] : null;
						if (!sku || seen[sku]) continue;
						seen[sku] = true;
						var text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
						text = text.replace(/\\.cls-\\d+\\s*\\{[^}]*\\}/g, '').trim();
						if (!text) continue;
						results.push({ sku: sku, name: text.slice(0, 120), url: href.split('?')[0] });
					}
					return results;
				})()
			`);

			return c.json({ boards, query: q, total: (boards as unknown[]).length });
		},
	},

	// ─── Route 8: Detail DOM Extraction (LAST RESORT) ────────────────────
	{
		method: 'GET',
		path: '/boards/:sku',
		description: 'Board detail. DOM extraction — last resort.',
		handler: async (c, browser) => {
			const page = browser.getPage();
			if (!page) return c.json({ error: 'Browser page not available' }, 503);

			const params = c.req.param() as Record<string, string>;
			const sku = params.sku;

			await browser.navigate(`https://www.boardshop.example.com/board/${sku}`);
			await new Promise((r) => setTimeout(r, 5000));

			const detail = await page.evaluate(`
				(function() {
					var el = document.querySelector('[data-board-sku]');
					if (!el) return null;
					var sku = el.getAttribute('data-board-sku');
					var brand = el.getAttribute('data-brand');
					var deckSize = el.getAttribute('data-deck-size');
					var text = el.innerText || '';
					var priceMatch = text.match(/\\$([0-9,]+(?:\\.[0-9]{2})?)/);
					var price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
					var lines = text.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
					var inStock = lines.some(function(l) { return /in stock/i.test(l); });
					return { sku: sku, brand: brand, deckSize: deckSize, price: price, inStock: inStock };
				})()
			`);

			if (!detail) return c.json({ error: 'Board not found on page' }, 404);
			return c.json(detail);
		},
	},

	// ═══════════════════════════════════════════════════════════════════════
	// CROSS-TRANSPORT EXAMPLES — these target OTHER test server sites
	// to demonstrate every transport type in the discovery protocol.
	// ═══════════════════════════════════════════════════════════════════════

	// ─── Route 9: GraphQL query (streamshop test server) ─────────────────
	// Pattern: POST to /gql with operationName + variables.
	// Auth: Client-ID header (found in page source <meta> tag or embedded JSON).
	// Persisted queries use sha256Hash instead of inline query string.
	{
		method: 'GET',
		path: '/graphql-example',
		description: 'GraphQL product search via streamshop test server.',
		browserRequired: false,
		handler: async (c) => {
			const STREAMSHOP_URL = 'http://localhost:4444/sites/streamshop';
			const category = new URL(c.req.url).searchParams.get('category') ?? '';
			const limit = Number(new URL(c.req.url).searchParams.get('limit') ?? '20');

			// Step 1: The Client-ID comes from the page source (meta tag or embedded JSON).
			// In discovery you'd fetch the HTML first and extract it.
			const CLIENT_ID = 'boardshop_client_abc123xyz';

			DEBUG('boardshop', `graphql-example: querying streamshop with category=${category}`);

			// Step 2: POST the GraphQL operation with variables
			const res = await rateLimitedFetch(`${STREAMSHOP_URL}/gql`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Client-ID': CLIENT_ID,
				},
				body: JSON.stringify({
					operationName: 'SearchProducts',
					variables: { limit, ...(category ? { category } : {}) },
					// Persisted query alternative — use sha256Hash instead of inline query:
					// extensions: { persistedQuery: { version: 1, sha256Hash: 'a1b2c3d4e5f6' } }
				}),
			});

			if (!res.ok) {
				DEBUG('boardshop', `graphql-example: failed ${res.status}`);
				return c.json({ error: `GraphQL returned ${res.status}` }, 502);
			}

			const gqlResponse = (await res.json()) as {
				data?: { searchProducts?: { items: unknown[]; totalCount: number } };
			};
			DEBUG(
				'boardshop',
				`graphql-example: got ${gqlResponse.data?.searchProducts?.items.length ?? 0} items`,
			);

			return c.json(gqlResponse.data?.searchProducts ?? { items: [], totalCount: 0 });
		},
	},

	// ─── Route 10: HLS media stream chain (streamshop test server) ───────
	// Pattern: Get access token → fetch master playlist → return stream URLs.
	// This is how video/audio streaming sites work (Twitch, YouTube Live, etc).
	{
		method: 'GET',
		path: '/hls-example',
		description: 'HLS stream discovery via streamshop test server.',
		browserRequired: false,
		handler: async (c) => {
			const STREAMSHOP_URL = 'http://localhost:4444/sites/streamshop';
			const channel = new URL(c.req.url).searchParams.get('channel') ?? 'boardshop-live';

			// Step 1: Get stream access token (signature + token)
			DEBUG('boardshop', `hls-example: getting token for channel=${channel}`);
			const tokenRes = await rateLimitedFetch(
				`${STREAMSHOP_URL}/stream/token?channel=${encodeURIComponent(channel)}`,
			);
			if (!tokenRes.ok) {
				return c.json({ error: `Token endpoint returned ${tokenRes.status}` }, 502);
			}
			const tokenData = (await tokenRes.json()) as { signature: string; token: string };
			DEBUG('boardshop', `hls-example: got token sig=${tokenData.signature.slice(0, 10)}...`);

			// Step 2: Fetch master playlist with token
			const playlistRes = await rateLimitedFetch(
				`${STREAMSHOP_URL}/stream/master.m3u8?sig=${encodeURIComponent(tokenData.signature)}&token=${encodeURIComponent(tokenData.token)}`,
			);
			if (!playlistRes.ok) {
				return c.json({ error: `Playlist returned ${playlistRes.status}` }, 502);
			}
			const playlist = await playlistRes.text();
			DEBUG('boardshop', `hls-example: playlist ${playlist.length} chars`);

			// Step 3: Parse quality variants from m3u8
			const variants: { quality: string; bandwidth: number; url: string }[] = [];
			const lines = playlist.split('\n');
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.startsWith('#EXT-X-STREAM-INF:')) {
					const bw = line.match(/BANDWIDTH=(\d+)/)?.[1];
					const nextLine = lines[i + 1]?.trim();
					if (bw && nextLine && !nextLine.startsWith('#')) {
						const quality = nextLine.replace('.m3u8', '').replace('stream/', '');
						variants.push({ quality, bandwidth: Number(bw), url: nextLine });
					}
				}
			}

			return c.json({ channel, variants, rawPlaylist: playlist });
		},
	},

	// ─── Route 11: Encoded API response (databoard test server) ──────────
	// Pattern: Response body is base64-encoded JSON. Decode before parsing.
	// The X-Encoding header tells you the encoding. Check JS bundles for
	// atob(), Buffer.from(), decode() calls near data field names.
	{
		method: 'GET',
		path: '/encoded-example',
		description: 'Base64-encoded JSON API via databoard test server.',
		browserRequired: false,
		handler: async (c) => {
			const DATABOARD_URL = 'http://localhost:4444/sites/databoard';
			const page = Number(new URL(c.req.url).searchParams.get('page') ?? '1');

			// Step 1: Get Bearer token (databoard requires auth)
			DEBUG('boardshop', 'encoded-example: getting Bearer token');
			const authRes = await rateLimitedFetch(`${DATABOARD_URL}/api/auth/token`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ clientId: 'boardshop-reference' }),
			});
			if (!authRes.ok) {
				return c.json({ error: `Auth returned ${authRes.status}` }, 502);
			}
			const auth = (await authRes.json()) as { access_token: string };
			DEBUG('boardshop', `encoded-example: got token ${auth.access_token.slice(0, 8)}...`);

			// Step 2: Fetch encoded products (response is base64, not JSON)
			const res = await rateLimitedFetch(`${DATABOARD_URL}/api/products?page=${page}`, {
				headers: { Authorization: `Bearer ${auth.access_token}` },
			});
			if (!res.ok) {
				return c.json({ error: `Encoded API returned ${res.status}` }, 502);
			}

			// Step 3: Decode — check X-Encoding header for the encoding type
			const encoding = res.headers.get('x-encoding');
			const rawBody = await res.text();
			DEBUG('boardshop', `encoded-example: encoding=${encoding}, body ${rawBody.length} chars`);

			if (encoding === 'base64') {
				const decoded = atob(rawBody);
				const data = JSON.parse(decoded) as Record<string, unknown>;
				return c.json(data);
			}

			// Fallback: try parsing as JSON directly
			return c.json(JSON.parse(rawBody));
		},
	},

	// ─── Route 12: REST API with crumb token auth (liveboard test server) ─
	// Pattern: Page embeds a crumb/CSRF token in embedded JSON. Extract it
	// from the page source, then pass it as a query param on API calls.
	// Token is in <script id="app-config"> → { crumb: "..." }
	{
		method: 'GET',
		path: '/crumb-example',
		description: 'Crumb-authenticated REST API via liveboard test server.',
		browserRequired: false,
		handler: async (c) => {
			const LIVEBOARD_URL = 'http://localhost:4444/sites/liveboard';
			const symbol = new URL(c.req.url).searchParams.get('symbol') ?? 'DECK-001';

			// Step 1: Fetch the page to get session cookie + crumb token
			DEBUG('boardshop', 'crumb-example: fetching liveboard page for crumb');
			const pageRes = await rateLimitedFetch(LIVEBOARD_URL);
			if (!pageRes.ok) {
				return c.json({ error: `Page returned ${pageRes.status}` }, 502);
			}
			const html = await pageRes.text();

			// Extract session cookie from Set-Cookie header
			const sessionCookie = pageRes.headers.get('set-cookie')?.match(/session=([^;]+)/)?.[1];

			// Extract crumb from embedded JSON in <script id="app-config">
			const configMatch = html.match(
				/<script\s+id="app-config"\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
			);
			if (!configMatch) {
				return c.json({ error: 'Could not find app-config in page source' }, 502);
			}
			const config = JSON.parse(configMatch[1]) as { crumb: string };
			DEBUG(
				'boardshop',
				`crumb-example: crumb=${config.crumb}, session=${sessionCookie?.slice(0, 8)}...`,
			);

			// Step 2: Call the REST API with crumb + session cookie
			const apiRes = await rateLimitedFetch(
				`${LIVEBOARD_URL}/api/quote/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(config.crumb)}`,
				{
					headers: {
						Cookie: `session=${sessionCookie}`,
					},
				},
			);
			if (!apiRes.ok) {
				DEBUG('boardshop', `crumb-example: API returned ${apiRes.status}`);
				return c.json({ error: `Quote API returned ${apiRes.status}` }, 502);
			}

			const quote = await apiRes.json();
			DEBUG('boardshop', `crumb-example: got quote for ${symbol}`);
			return c.json(quote);
		},
	},
];
