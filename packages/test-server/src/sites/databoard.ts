/**
 * Databoard Site — API-heavy fake website.
 *
 * Simulates heavy-API patterns:
 * - Full GraphQL with inline queries
 * - gRPC-Web with protobuf framing
 * - Base64-encoded JSON responses
 * - Protobuf binary responses + schema endpoint
 * - Msgpack binary responses
 * - Bearer token auth flow
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { getProductPage, MAX_PAGE_SIZE, PRODUCTS } from '../data/products';
import { encodeBase64, encodeMsgpack } from '../transports/encoded';
import { encodeProductList, grpcWebFrame, PROTO_DEFINITION } from '../transports/protobuf';

// Bearer tokens
const bearerTokens = new Set<string>();

export function createDataboardSite(): Hono {
	const app = new Hono();

	// ─── Auth token endpoint ────────────────────────────────────────
	app.post('/api/auth/token', async (c) => {
		const body = (await c.req.json().catch(() => ({}))) as { clientId?: string };
		if (!body.clientId) return c.json({ error: 'clientId required' }, 400);
		const token = randomUUID();
		bearerTokens.add(token);
		return c.json({ access_token: token, token_type: 'Bearer', expires_in: 3600 });
	});

	function requireBearer(c: { req: { header: (name: string) => string | undefined } }): boolean {
		const auth = c.req.header('authorization');
		if (!auth?.startsWith('Bearer ')) return false;
		return bearerTokens.has(auth.slice(7));
	}

	// ─── GraphQL (mounted at /graphql, resolver handles POST directly) ──
	const gqlResolver = {
		products: (args?: { category?: string; limit?: number }) => {
			const filtered = args?.category
				? PRODUCTS.filter((p) => p.category === args.category)
				: PRODUCTS;
			return filtered.slice(0, args?.limit ?? 20);
		},
		product: (sku: string) => PRODUCTS.find((p) => p.sku === sku),
	};

	app.post('/graphql', async (c) => {
		const body = await c.req.json();
		const ops = Array.isArray(body) ? body : [body];
		const results = ops.map(
			(op: { operationName?: string; variables?: Record<string, unknown> }) => {
				const name = op.operationName ?? '';
				const vars = op.variables ?? {};
				if (name === 'SearchProducts' || name.includes('roduct')) {
					const limit = (vars.limit as number) ?? 20;
					const products = gqlResolver.products({ category: vars.category as string, limit });
					return {
						data: {
							searchProducts: { items: products.slice(0, limit), totalCount: products.length },
						},
					};
				}
				if (name === 'GetProduct') {
					const product = gqlResolver.product(vars.sku as string);
					return product
						? { data: { product } }
						: { data: null, errors: [{ message: 'Not found' }] };
				}
				return { data: null, errors: [{ message: `Unknown operation: ${name}` }] };
			},
		);
		return c.json(Array.isArray(body) ? results : results[0]);
	});

	// ─── gRPC-Web ───────────────────────────────────────────────────
	app.post('/grpc/BoardService/ListProducts', async (c) => {
		if (!requireBearer(c)) return c.text('Unauthorized', 401);

		const page = getProductPage(1, MAX_PAGE_SIZE);
		const encoded = encodeProductList(page.items, page.totalCount);
		const framed = grpcWebFrame(encoded);

		c.header('Content-Type', 'application/grpc-web+proto');
		return c.body(new Uint8Array(framed));
	});

	// ─── Base64-encoded JSON ────────────────────────────────────────
	app.get('/api/products', (c) => {
		if (!requireBearer(c)) return c.json({ error: 'Unauthorized' }, 401);

		const page = Number(c.req.query('page') ?? 1);
		const result = getProductPage(page, MAX_PAGE_SIZE);
		const encoded = encodeBase64(result);

		c.header('Content-Type', 'application/octet-stream');
		c.header('X-Encoding', 'base64');
		return c.body(encoded.toString('base64'));
	});

	// ─── Protobuf binary ────────────────────────────────────────────
	app.get('/api/inventory', (c) => {
		if (!requireBearer(c)) return c.text('Unauthorized', 401);

		const page = getProductPage(1, MAX_PAGE_SIZE);
		const encoded = encodeProductList(page.items, page.totalCount);

		c.header('Content-Type', 'application/x-protobuf');
		return c.body(Buffer.from(encoded));
	});

	// ─── Protobuf schema ────────────────────────────────────────────
	app.get('/api/schema.proto', (c) => {
		c.header('Content-Type', 'text/plain');
		return c.text(PROTO_DEFINITION);
	});

	// ─── Msgpack binary ─────────────────────────────────────────────
	app.get('/api/stats', (c) => {
		if (!requireBearer(c)) return c.text('Unauthorized', 401);

		const stats = {
			totalProducts: PRODUCTS.length,
			categories: { decks: 40, trucks: 30, wheels: 30, accessories: 20 },
			avgPrice:
				Math.round((PRODUCTS.reduce((s, p) => s + p.price, 0) / PRODUCTS.length) * 100) / 100,
			topBrands: ['Element', 'Independent', 'Spitfire'],
		};
		const encoded = encodeMsgpack(stats);

		c.header('Content-Type', 'application/x-msgpack');
		return c.body(Buffer.from(encoded));
	});

	return app;
}
