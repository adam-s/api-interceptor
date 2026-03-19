/**
 * GraphQL transport — supports inline queries, persisted queries, and batched operations.
 * Used by streamshop and databoard sites.
 */

import { Hono } from 'hono';
import type { Product } from '../data/products';

export interface GraphQLConfig {
	/** Required header for auth (e.g., 'Client-ID') */
	requiredHeader?: { name: string; value: string };
	/** Persisted query hash registry */
	persistedQueries?: Record<string, string>;
	/** Data resolver */
	resolver: GraphQLResolver;
}

export interface GraphQLResolver {
	products: (args?: { category?: string; limit?: number }) => Product[];
	product: (sku: string) => Product | undefined;
}

interface GQLOperation {
	operationName?: string;
	query?: string;
	variables?: Record<string, unknown>;
	extensions?: {
		persistedQuery?: { version: number; sha256Hash: string };
	};
}

function resolveOperation(op: GQLOperation, config: GraphQLConfig): unknown {
	const name = op.operationName ?? '';

	// Check persisted query
	if (op.extensions?.persistedQuery?.sha256Hash && !op.query) {
		const hash = op.extensions.persistedQuery.sha256Hash;
		const registered = config.persistedQueries?.[hash];
		if (!registered) {
			return { errors: [{ message: 'PersistedQueryNotFound' }] };
		}
		// Use registered operation name
		return resolveByName(registered, op.variables ?? {}, config);
	}

	// Inline query — resolve by operation name or query content
	if (name) return resolveByName(name, op.variables ?? {}, config);

	// Try to detect from query string
	const q = op.query ?? '';
	if (q.includes('products') || q.includes('Products'))
		return resolveByName('SearchProducts', op.variables ?? {}, config);
	if (q.includes('product') || q.includes('Product'))
		return resolveByName('GetProduct', op.variables ?? {}, config);

	return { data: null, errors: [{ message: 'Unknown operation' }] };
}

function resolveByName(
	name: string,
	variables: Record<string, unknown>,
	config: GraphQLConfig,
): unknown {
	switch (name) {
		case 'SearchProducts': {
			const category = variables.category as string | undefined;
			const limit = (variables.limit as number) ?? 20;
			const products = config.resolver.products({ category, limit });
			return {
				data: { searchProducts: { items: products.slice(0, limit), totalCount: products.length } },
			};
		}
		case 'GetProduct': {
			const sku = variables.sku as string;
			const product = config.resolver.product(sku);
			return product ? { data: { product } } : { data: null, errors: [{ message: 'Not found' }] };
		}
		default:
			return { data: null, errors: [{ message: `Unknown operation: ${name}` }] };
	}
}

export function createGraphQLRoutes(basePath: string, config: GraphQLConfig): Hono {
	const app = new Hono();

	app.post(`${basePath}/gql`, async (c) => {
		// Check required header
		if (config.requiredHeader) {
			const val = c.req.header(config.requiredHeader.name);
			if (val !== config.requiredHeader.value) {
				return c.json(
					{ errors: [{ message: `Missing or invalid ${config.requiredHeader.name}` }] },
					401,
				);
			}
		}

		const body = await c.req.json();

		// Batched operations (JSON array)
		if (Array.isArray(body)) {
			const results = body.map((op: GQLOperation) => resolveOperation(op, config));
			return c.json(results);
		}

		// Single operation
		return c.json(resolveOperation(body as GQLOperation, config));
	});

	return app;
}
