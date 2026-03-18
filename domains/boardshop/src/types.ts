/**
 * BoardShop API Types (Reference Example)
 *
 * Zod schemas and TypeScript types for the fictional BoardShop skateboard marketplace.
 * Demonstrates the pattern: define schemas once, derive types, use for validation.
 *
 * PATTERN: Every API response gets a Zod schema. Parse responses with schema.parse()
 * to catch unexpected shapes early instead of crashing deep in business logic.
 *
 * @module domain-boardshop/types
 */

import { z } from 'zod';

// ─── Authentication Headers ─────────────────────────────────────────────────
// PATTERN: Define required headers as a Zod schema. The interceptor validates
// captured headers against this schema automatically.

export const BoardShopHeadersSchema = z.object({
	Authorization: z.string().startsWith('Bearer '),
	'X-Shop-Session': z.string(),
});
export type BoardShopHeaders = z.infer<typeof BoardShopHeadersSchema>;

export const REQUIRED_HEADER_NAMES = ['Authorization', 'X-Shop-Session'] as const;

// ─── Domain Entities ────────────────────────────────────────────────────────

export const BoardSchema = z.object({
	sku: z.string(),
	brand: z.string(),
	model: z.string(),
	deckSize: z.string(),
	price: z.number(),
	currency: z.string().default('USD'),
	inStock: z.boolean(),
	imageUrl: z.string().url().optional(),
});
export type Board = z.infer<typeof BoardSchema>;

export const ShopSchema = z.object({
	id: z.string(),
	name: z.string(),
	city: z.string(),
	state: z.string(),
	rating: z.number().min(0).max(5),
	boardCount: z.number(),
});
export type Shop = z.infer<typeof ShopSchema>;

export const OrderSchema = z.object({
	orderId: z.string(),
	sku: z.string(),
	quantity: z.number().int().positive(),
	totalCents: z.number().int(),
	status: z.enum(['pending', 'confirmed', 'shipped', 'delivered']),
	createdAt: z.string(),
});
export type Order = z.infer<typeof OrderSchema>;

// ─── API Response Wrappers ──────────────────────────────────────────────────
// PATTERN: Paginated responses use a cursor string for next-page fetching.
// The cursor is opaque — don't parse it, just pass it back on the next request.

export const PaginatedBoardsSchema = z.object({
	results: z.array(BoardSchema),
	next: z.string().nullable(),
	total: z.number(),
});
export type PaginatedBoards = z.infer<typeof PaginatedBoardsSchema>;

export const ShopsResponseSchema = z.object({
	shops: z.array(ShopSchema),
});

export const OrderResponseSchema = z.object({
	order: OrderSchema,
});

// ─── Session State ──────────────────────────────────────────────────────────

export type SessionStatus =
	| { status: 'disconnected'; profileName: string }
	| {
			status: 'connected';
			profileName: string;
			connectedAt: number;
			verified: boolean;
			accountId?: string;
			lastTokenRefresh?: number;
			needsTokenRefresh?: boolean;
	  }
	| { status: 'expired'; profileName: string; connectedAt: number };

export type SessionEventType =
	| 'connected'
	| 'verified'
	| 'verification_failed'
	| 'disconnected'
	| 'expired'
	| 'restored';
