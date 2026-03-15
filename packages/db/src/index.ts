import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// --- Lazy initialization via Proxy ---
// Importing this module does NOT throw if DATABASE_URL is missing.
// The error fires only when you actually use `db`.

type DbType = ReturnType<typeof drizzle<typeof schema>>;

let _queryClient: ReturnType<typeof postgres> | null = null;
let _db: DbType | null = null;

function getDbUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error('DATABASE_URL is not set. Add it to .env or set it in your environment.');
	}
	return url;
}

function getQueryClient() {
	if (!_queryClient) _queryClient = postgres(getDbUrl());
	return _queryClient;
}

function getDb(): DbType {
	if (!_db) _db = drizzle(getQueryClient(), { schema });
	return _db;
}

/** Lazy-initialized Drizzle client. Safe to import without DATABASE_URL. */
export const db = new Proxy({} as DbType, {
	get(_target, prop) {
		return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
	},
});

/** Raw postgres.js connection for bulk operations. */
export function createRawConnection(options?: { max?: number }) {
	return postgres(getDbUrl(), {
		max: options?.max ?? 1,
		onnotice: () => {},
	});
}

/** Close the connection pool. Call in script exit paths to prevent hangs. */
export async function closeDb(): Promise<void> {
	if (_queryClient) {
		await _queryClient.end();
		_queryClient = null;
		_db = null;
	}
}

// Re-export common drizzle utilities for one-stop imports
export { and, asc, desc, eq, gt, gte, lt, lte, ne, or, sql } from 'drizzle-orm';
// Re-export schema
export * from './schema';
