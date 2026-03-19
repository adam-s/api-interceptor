/**
 * Streamshop Site — Media streaming fake website.
 *
 * Simulates live media streaming patterns:
 * - GraphQL with persisted queries, batched operations, Client-ID auth
 * - HLS video stream (token → master playlist → variant → segments)
 * - IRC-like chat WebSocket
 * - Channel page HTML referencing all endpoints
 */

import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { CHANNELS, QUALITY_VARIANTS } from '../data/media';
import { PRODUCTS } from '../data/products';
import { renderEmbeddedPage } from '../transports/embedded-html';
import { createGraphQLRoutes } from '../transports/graphql';
import { createHLSRoutes } from '../transports/hls';

const CLIENT_ID = 'boardshop_client_abc123xyz';

// Integrity tokens
const integrityTokens = new Set<string>();

export function createStreamshopSite(): Hono {
	const app = new Hono();

	// ─── GraphQL ────────────────────────────────────────────────────
	const gql = createGraphQLRoutes('', {
		requiredHeader: { name: 'Client-ID', value: CLIENT_ID },
		persistedQueries: {
			a1b2c3d4e5f6: 'SearchProducts',
			f6e5d4c3b2a1: 'GetProduct',
		},
		resolver: {
			products: (args) => {
				const filtered = args?.category
					? PRODUCTS.filter((p) => p.category === args.category)
					: PRODUCTS;
				return filtered.slice(0, args?.limit ?? 20);
			},
			product: (sku) => PRODUCTS.find((p) => p.sku === sku),
		},
	});
	app.route('', gql);

	// ─── Integrity endpoint ─────────────────────────────────────────
	app.post('/gql/integrity', (c) => {
		const clientId = c.req.header('Client-ID');
		if (clientId !== CLIENT_ID) {
			return c.json({ error: 'Invalid Client-ID' }, 401);
		}
		const token = randomUUID();
		integrityTokens.add(token);
		return c.json({ token });
	});

	// ─── HLS Stream ─────────────────────────────────────────────────
	const hls = createHLSRoutes('', {
		channels: CHANNELS,
		tokenSecret: 'boardshop-stream-secret',
	});
	app.route('', hls);

	// ─── Channel page (HTML referencing all services) ───────────────
	app.get('/channel/:name', (c) => {
		const name = c.req.param('name');
		const channel = CHANNELS.find((ch) => ch.name === name) ?? CHANNELS[0];

		const html = renderEmbeddedPage({
			title: `${channel.name} — StreamShop Live`,
			dataScripts: [
				{
					id: 'channel-data',
					data: {
						channel,
						qualities: QUALITY_VARIANTS.map((v) => v.name),
					},
				},
				{
					id: 'app-config',
					data: {
						clientId: CLIENT_ID,
						gqlEndpoint: '/sites/streamshop/gql',
						chatWsUrl: 'wss://chat.streamshop.example.com',
						hlsTokenUrl: '/sites/streamshop/stream/token',
					},
				},
			],
			metaTags: [{ name: 'client-id', content: CLIENT_ID }],
			bodyHtml:
				`<div data-testid="channel-page" data-channel="${channel.name}">` +
				`<section data-testid="video-player"><video></video></section>` +
				`<section data-testid="chat-panel" data-a-target="chat-room">` +
				`<div data-a-target="chat-scroller"></div>` +
				`<input data-a-target="chat-input" type="text">` +
				`</section>` +
				`<div data-testid="stream-info">` +
				`<h2 data-testid="stream-title">${channel.title}</h2>` +
				`<span data-testid="viewer-count">${channel.viewerCount}</span>` +
				`<span data-testid="stream-category">${channel.category}</span>` +
				`</div>` +
				`</div>`,
		});

		c.header('Content-Type', 'text/html; charset=utf-8');
		return c.html(html);
	});

	return app;
}

export { CLIENT_ID as STREAMSHOP_CLIENT_ID };
