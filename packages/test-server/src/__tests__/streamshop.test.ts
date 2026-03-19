import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createTestServer, type TestServerInstance } from '../index';
import { STREAMSHOP_CLIENT_ID } from '../sites/streamshop';

let server: TestServerInstance;
let baseUrl: string;

beforeAll(async () => {
	server = await createTestServer({ port: 0 });
	baseUrl = `${server.url}/sites/streamshop`;
});

afterAll(async () => {
	await server.close();
});

describe('streamshop site', () => {
	test('GraphQL requires Client-ID header', async () => {
		// Without Client-ID → 401
		const res1 = await fetch(`${baseUrl}/gql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ operationName: 'SearchProducts', variables: {} }),
		});
		expect(res1.status).toBe(401);

		// With Client-ID → 200
		const res2 = await fetch(`${baseUrl}/gql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Client-ID': STREAMSHOP_CLIENT_ID },
			body: JSON.stringify({ operationName: 'SearchProducts', variables: {} }),
		});
		expect(res2.status).toBe(200);
		const data = await res2.json();
		expect(data.data.searchProducts.items.length).toBeGreaterThan(0);
	});

	test('GraphQL accepts batched operations', async () => {
		const res = await fetch(`${baseUrl}/gql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Client-ID': STREAMSHOP_CLIENT_ID },
			body: JSON.stringify([
				{ operationName: 'SearchProducts', variables: { limit: 5 } },
				{ operationName: 'GetProduct', variables: { sku: 'DECK-001' } },
			]),
		});

		const data = await res.json();
		expect(Array.isArray(data)).toBe(true);
		expect(data.length).toBe(2);
		expect(data[0].data.searchProducts.items.length).toBe(5);
		expect(data[1].data.product.sku).toBe('DECK-001');
	});

	test('persisted queries work with known hashes', async () => {
		const res = await fetch(`${baseUrl}/gql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Client-ID': STREAMSHOP_CLIENT_ID },
			body: JSON.stringify({
				operationName: 'SearchProducts',
				variables: { limit: 3 },
				extensions: { persistedQuery: { version: 1, sha256Hash: 'a1b2c3d4e5f6' } },
			}),
		});

		const data = await res.json();
		expect(data.data.searchProducts.items.length).toBe(3);
	});

	test('unknown persisted query hash returns PersistedQueryNotFound', async () => {
		const res = await fetch(`${baseUrl}/gql`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Client-ID': STREAMSHOP_CLIENT_ID },
			body: JSON.stringify({
				extensions: { persistedQuery: { version: 1, sha256Hash: 'unknown_hash' } },
			}),
		});

		const data = await res.json();
		expect(data.errors[0].message).toBe('PersistedQueryNotFound');
	});

	test('HLS token → master playlist → variant playlist chain works', async () => {
		// Step 1: Get token
		const tokenRes = await fetch(`${baseUrl}/stream/token?channel=boardshop-live`);
		const tokenData = await tokenRes.json();
		expect(tokenData.signature).toBeTruthy();
		expect(tokenData.token).toBeTruthy();

		// Step 2: Get master playlist
		const masterRes = await fetch(
			`${baseUrl}/stream/master.m3u8?sig=${tokenData.signature}&token=${encodeURIComponent(tokenData.token)}`,
		);
		expect(masterRes.status).toBe(200);
		const playlist = await masterRes.text();
		expect(playlist).toContain('#EXTM3U');
		expect(playlist).toContain('1080p60');
		expect(playlist).toContain('720p60');
		expect(playlist).toContain('audio_only');

		// Step 3: Get variant playlist (relative URL in master)
		expect(playlist).toContain('stream/720p60.m3u8');

		const variantRes = await fetch(`${baseUrl}/stream/720p60.m3u8`);
		const variantPlaylist = await variantRes.text();
		expect(variantPlaylist).toContain('#EXTM3U');
		expect(variantPlaylist).toContain('#EXTINF:');
		expect(variantPlaylist).toContain('.ts');
	});

	test('HLS master playlist requires valid token', async () => {
		const res = await fetch(`${baseUrl}/stream/master.m3u8`);
		expect(res.status).toBe(403);
	});

	test('chat WebSocket sends IRC-formatted text frames', async () => {
		const wsUrl = `${server.url.replace('http', 'ws')}/sites/streamshop/chat`;

		const messages: string[] = [];
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(wsUrl);
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error('WS timeout'));
			}, 5000);

			ws.on('open', () => {
				// IRC handshake
				ws.send('CAP REQ :testserver.tv/tags testserver.tv/commands');
				ws.send('NICK testviewer');
				ws.send('JOIN #boardshop-live');
			});

			ws.on('message', (data) => {
				const text = data.toString();
				messages.push(text);
				// Wait for at least one PRIVMSG
				if (text.includes('PRIVMSG')) {
					clearTimeout(timeout);
					ws.close();
					resolve();
				}
			});

			ws.on('error', (e) => {
				clearTimeout(timeout);
				reject(e);
			});
		});

		// Should have IRC protocol messages + at least one chat message
		const privmsgs = messages.filter((m) => m.includes('PRIVMSG'));
		expect(privmsgs.length).toBeGreaterThan(0);
		expect(privmsgs[0]).toContain('#boardshop-live');
	});

	test('channel page references all services', async () => {
		const res = await fetch(`${baseUrl}/channel/boardshop-live`);
		const html = await res.text();

		// Embedded data
		expect(html).toContain('channel-data');
		expect(html).toContain('app-config');
		expect(html).toContain(STREAMSHOP_CLIENT_ID);

		// DOM structure
		expect(html).toContain('data-testid="video-player"');
		expect(html).toContain('data-testid="chat-panel"');
		expect(html).toContain('data-testid="stream-title"');
		expect(html).toContain('data-testid="viewer-count"');
	});
});
