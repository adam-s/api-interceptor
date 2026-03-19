/**
 * Canonical product dataset — skateboards, trucks, wheels, accessories.
 * 120 products across 4 categories for pagination testing (pageSize 20 = 6 pages).
 */

export interface Product {
	sku: string;
	name: string;
	category: 'decks' | 'trucks' | 'wheels' | 'accessories';
	price: number;
	currency: string;
	stock: number;
	brand: string;
	rating: number;
	reviewCount: number;
	description: string;
}

const BRANDS = {
	decks: ['Element', 'Baker', 'Girl', 'Primitive', 'Real', 'Santa Cruz'],
	trucks: ['Independent', 'Thunder', 'Venture', 'Ace', 'Krux'],
	wheels: ['Spitfire', 'Bones', 'Ricta', 'OJ', 'Mini Logo'],
	accessories: ['Bronson', 'Bones', 'Shake Junt', 'Mob', 'Jessup'],
};

const DECK_NAMES = [
	'Street Destroyer', 'Park Ripper', 'Vert Classic', 'Cruiser Pro',
	'Tech Slide', 'Mini Shred', 'Pool Bomber', 'Rail Slayer',
	'Kickflip King', 'Ollie Master',
];

const SIZES = ['7.75', '8.0', '8.25', '8.5', '8.75'];

function generateProducts(): Product[] {
	const products: Product[] = [];
	let idx = 1;

	// 40 decks
	for (const brand of BRANDS.decks) {
		for (const name of DECK_NAMES.slice(0, 7)) {
			if (idx > 40) break;
			const size = SIZES[idx % SIZES.length];
			products.push({
				sku: `DECK-${String(idx).padStart(3, '0')}`,
				name: `${name} ${size}`,
				category: 'decks',
				price: Math.round((44.99 + idx * 1.5) * 100) / 100,
				currency: 'USD',
				stock: Math.floor(Math.random() * 50) + 1,
				brand,
				rating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
				reviewCount: Math.floor(Math.random() * 200) + 10,
				description: `${brand} ${name} ${size}" skateboard deck. Canadian maple construction.`,
			});
			idx++;
		}
	}

	// 30 trucks
	idx = 1;
	const truckModels = ['Stage 11', 'Hollow', 'Titanium', 'Standard', 'Light', 'Forged'];
	for (const brand of BRANDS.trucks) {
		for (const model of truckModels) {
			if (idx > 30) break;
			products.push({
				sku: `TRUCK-${String(idx).padStart(3, '0')}`,
				name: `${model} ${139 + idx * 2}mm`,
				category: 'trucks',
				price: Math.round((29.99 + idx * 2) * 100) / 100,
				currency: 'USD',
				stock: Math.floor(Math.random() * 30) + 1,
				brand,
				rating: Math.round((3.8 + Math.random() * 1.2) * 10) / 10,
				reviewCount: Math.floor(Math.random() * 150) + 5,
				description: `${brand} ${model} trucks. ${139 + idx * 2}mm axle width.`,
			});
			idx++;
		}
	}

	// 30 wheels
	idx = 1;
	const wheelModels = ['Formula Four', 'Street Tech', 'Park Pro', 'Cruiser', 'Conical', 'Classic'];
	for (const brand of BRANDS.wheels) {
		for (const model of wheelModels) {
			if (idx > 30) break;
			const size = 50 + idx;
			products.push({
				sku: `WHEEL-${String(idx).padStart(3, '0')}`,
				name: `${model} ${size}mm`,
				category: 'wheels',
				price: Math.round((24.99 + idx * 1.2) * 100) / 100,
				currency: 'USD',
				stock: Math.floor(Math.random() * 80) + 1,
				brand,
				rating: Math.round((4.0 + Math.random() * 1.0) * 10) / 10,
				reviewCount: Math.floor(Math.random() * 300) + 20,
				description: `${brand} ${model} ${size}mm skateboard wheels. 99a durometer.`,
			});
			idx++;
		}
	}

	// 20 accessories
	idx = 1;
	const accNames = ['Speed Bearings', 'Ceramic Bearings', 'Grip Tape', 'Hardware Set', 'Riser Pads'];
	for (const brand of BRANDS.accessories) {
		for (const name of accNames.slice(0, 4)) {
			if (idx > 20) break;
			products.push({
				sku: `ACC-${String(idx).padStart(3, '0')}`,
				name,
				category: 'accessories',
				price: Math.round((9.99 + idx * 1.5) * 100) / 100,
				currency: 'USD',
				stock: Math.floor(Math.random() * 100) + 10,
				brand,
				rating: Math.round((4.0 + Math.random() * 1.0) * 10) / 10,
				reviewCount: Math.floor(Math.random() * 500) + 50,
				description: `${brand} ${name}. Essential skateboard component.`,
			});
			idx++;
		}
	}

	return products;
}

export const PRODUCTS = generateProducts();

/** Get paginated products. Returns empty array if pageSize > MAX_PAGE_SIZE (silent fail). */
export const MAX_PAGE_SIZE = 20;

export function getProductPage(page: number, pageSize: number, category?: string): {
	items: Product[];
	totalCount: number;
	remaining: number;
	currentPage: number;
	pageSize: number;
} {
	// Silent page size limit — returns empty like real APIs do
	if (pageSize > MAX_PAGE_SIZE) {
		return { items: [], totalCount: 0, remaining: 0, currentPage: page, pageSize };
	}

	const filtered = category
		? PRODUCTS.filter((p) => p.category === category)
		: PRODUCTS;

	const start = (page - 1) * pageSize;
	const items = filtered.slice(start, start + pageSize);
	const remaining = Math.max(0, filtered.length - start - items.length);

	return {
		items,
		totalCount: filtered.length,
		remaining,
		currentPage: page,
		pageSize,
	};
}

/** Cursor-based pagination for reviews */
export interface Review {
	id: string;
	sku: string;
	author: string;
	rating: number;
	text: string;
	date: string;
}

const REVIEW_AUTHORS = ['sk8er_mike', 'pro_jane', 'deck_lord', 'wheel_wizard', 'grind_master', 'flip_queen', 'rail_rider', 'park_rat'];
const REVIEW_TEXTS = [
	'Solid board, great pop.',
	'Best deck I\'ve owned. Super durable.',
	'Good value for the price.',
	'Feels a bit heavy but rides smooth.',
	'Perfect for street skating.',
	'Love the graphic design.',
	'Snapped after 2 months. Meh.',
	'Amazing concave. Highly recommend.',
];

function generateReviews(): Review[] {
	const reviews: Review[] = [];
	for (let i = 0; i < 50; i++) {
		reviews.push({
			id: `REV-${String(i + 1).padStart(4, '0')}`,
			sku: PRODUCTS[i % PRODUCTS.length].sku,
			author: REVIEW_AUTHORS[i % REVIEW_AUTHORS.length],
			rating: 3 + (i % 3),
			text: REVIEW_TEXTS[i % REVIEW_TEXTS.length],
			date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
		});
	}
	return reviews;
}

export const REVIEWS = generateReviews();

export function getReviewsCursor(after: string | null, limit = 10): {
	items: Review[];
	pageInfo: { endCursor: string | null; hasNextPage: boolean };
} {
	let startIdx = 0;
	if (after) {
		const idx = REVIEWS.findIndex((r) => r.id === after);
		if (idx >= 0) startIdx = idx + 1;
	}
	const items = REVIEWS.slice(startIdx, startIdx + limit);
	const hasNextPage = startIdx + limit < REVIEWS.length;
	const endCursor = items.length > 0 ? items[items.length - 1].id : null;
	return { items, pageInfo: { endCursor, hasNextPage } };
}
