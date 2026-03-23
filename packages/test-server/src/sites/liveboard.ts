/**
 * Liveboard Site — Real-time data fake website.
 *
 * Simulates real-time financial data patterns:
 * - Embedded JSON snapshot with price data + crumb token
 * - WebSocket with protobuf-encoded price updates (base64 wrapped)
 * - REST API requiring crumb token as query param
 * - Custom DOM elements with data-field, data-symbol, data-value
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { generateSnapshot, TRACKED_SKUS } from '../data/prices';
import { PRODUCTS } from '../data/products';
import { renderEmbeddedPage } from '../transports/embedded-html';

// Crumb tokens per session
const crumbs = new Map<string, string>();

export function createLiveboardSite(): Hono {
	const app = new Hono();

	// ─── Main page (HTML with embedded snapshot + crumb) ────────────
	app.get('/', (c) => {
		const crumb = randomUUID().slice(0, 11);
		const sessionId = randomUUID();
		crumbs.set(sessionId, crumb);

		const snapshot = generateSnapshot();

		// Build live-value custom elements
		const liveElements = snapshot
			.map((s) => {
				const product = PRODUCTS.find((p) => p.sku === s.sku);
				return (
					`<div data-testid="quote-card" data-sku="${s.sku}">` +
					`<span data-testid="quote-name">${product?.name ?? s.sku}</span>` +
					`<live-value data-field="price" data-symbol="${s.sku}" data-value="${s.price}">$${s.price.toFixed(2)}</live-value>` +
					`<live-value data-field="dayHigh" data-symbol="${s.sku}" data-value="${s.dayHigh}">$${s.dayHigh.toFixed(2)}</live-value>` +
					`<live-value data-field="dayLow" data-symbol="${s.sku}" data-value="${s.dayLow}">$${s.dayLow.toFixed(2)}</live-value>` +
					`<live-value data-field="volume" data-symbol="${s.sku}" data-value="${s.volume}">${s.volume}</live-value>` +
					`</div>`
				);
			})
			.join('\n');

		const html = renderEmbeddedPage({
			title: 'LiveBoard — Real-Time Board Prices',
			dataScripts: [
				{
					id: 'market-data',
					data: {
						snapshot,
						trackedSymbols: TRACKED_SKUS,
						lastUpdated: Date.now(),
					},
				},
				{
					id: 'app-config',
					data: {
						host: 'query.liveboard.example.com',
						crumb,
						streamerUrl: 'wss://stream.liveboard.example.com/prices',
					},
				},
			],
			bodyHtml: `<section data-testid="market-overview">\n${liveElements}\n</section>`,
		});

		c.header('Set-Cookie', `session=${sessionId}; Path=/; SameSite=Lax`);
		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	// ─── REST API (requires crumb) ──────────────────────────────────
	app.get('/api/quote/:symbol', (c) => {
		const crumb = c.req.query('crumb');
		const sessionCookie = c.req.header('cookie')?.match(/session=([^;]+)/)?.[1];

		if (!sessionCookie || !crumbs.has(sessionCookie) || crumbs.get(sessionCookie) !== crumb) {
			return c.json({ error: 'Invalid crumb token' }, 401);
		}

		const symbol = c.req.param('symbol');
		const product = PRODUCTS.find((p) => p.sku === symbol);
		if (!product) return c.json({ error: 'Symbol not found' }, 404);

		const snapshot = generateSnapshot().find((s) => s.sku === symbol);
		return c.json({
			symbol,
			name: product.name,
			price: snapshot?.price ?? product.price,
			dayHigh: snapshot?.dayHigh ?? product.price + 5,
			dayLow: snapshot?.dayLow ?? product.price - 5,
			volume: snapshot?.volume ?? 100,
			brand: product.brand,
			category: product.category,
		});
	});

	// ─── Crumb endpoint (anti-CSRF token via separate request) ──────
	app.get('/api/crumb', (c) => {
		const sessionCookie = c.req.header('cookie')?.match(/session=([^;]+)/)?.[1];
		if (!sessionCookie || !crumbs.has(sessionCookie)) {
			return c.text('Unauthorized', 401);
		}
		// biome-ignore lint/style/noNonNullAssertion: checked has() above
		return c.text(crumbs.get(sessionCookie)!);
	});

	return app;
}
