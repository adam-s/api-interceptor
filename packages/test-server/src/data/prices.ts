/**
 * Real-time price update stream data for WebSocket and SSE transports.
 */

export interface PriceUpdate {
	sku: string;
	price: number;
	previousPrice: number;
	change: number;
	changePercent: number;
	volume: number;
	timestamp: number;
}

export interface PriceSnapshot {
	sku: string;
	price: number;
	dayHigh: number;
	dayLow: number;
	volume: number;
}

/** Symbols tracked for real-time streaming */
export const TRACKED_SKUS = [
	'DECK-001', 'DECK-005', 'DECK-010',
	'TRUCK-001', 'TRUCK-005',
	'WHEEL-001', 'WHEEL-010',
	'ACC-001',
];

/** Generate a price snapshot for all tracked SKUs */
export function generateSnapshot(): PriceSnapshot[] {
	return TRACKED_SKUS.map((sku) => {
		const base = sku.startsWith('DECK') ? 60 : sku.startsWith('TRUCK') ? 40 : sku.startsWith('WHEEL') ? 30 : 15;
		const price = Math.round((base + Math.random() * 20) * 100) / 100;
		return {
			sku,
			price,
			dayHigh: Math.round((price + Math.random() * 5) * 100) / 100,
			dayLow: Math.round((price - Math.random() * 5) * 100) / 100,
			volume: Math.floor(Math.random() * 1000) + 100,
		};
	});
}

/** Generate a single price update (for streaming) */
export function generatePriceUpdate(): PriceUpdate {
	const sku = TRACKED_SKUS[Math.floor(Math.random() * TRACKED_SKUS.length)];
	const base = sku.startsWith('DECK') ? 60 : sku.startsWith('TRUCK') ? 40 : sku.startsWith('WHEEL') ? 30 : 15;
	const previousPrice = Math.round((base + Math.random() * 20) * 100) / 100;
	const change = Math.round((Math.random() * 4 - 2) * 100) / 100;
	const price = Math.round((previousPrice + change) * 100) / 100;
	return {
		sku,
		price,
		previousPrice,
		change,
		changePercent: Math.round((change / previousPrice) * 10000) / 100,
		volume: Math.floor(Math.random() * 100) + 1,
		timestamp: Date.now(),
	};
}
