import protobufjs from 'protobufjs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { createTestServer, type TestServerInstance } from '../index';
import { PROTO_DEFINITION } from '../transports/protobuf';

let server: TestServerInstance;
let baseUrl: string;

beforeAll(async () => {
	server = await createTestServer({ port: 0 });
	baseUrl = `${server.url}/sites/liveboard`;
});

afterAll(async () => {
	await server.close();
});

describe('liveboard site', () => {
	test('page has embedded JSON snapshot with prices', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		expect(html).toContain('<script id="market-data" type="application/json">');
		const match = html.match(/<script id="market-data" type="application\/json">(.+?)<\/script>/s);
		const data = JSON.parse(match![1]);

		expect(data.snapshot.length).toBeGreaterThan(0);
		expect(data.snapshot[0].sku).toBeTruthy();
		expect(data.snapshot[0].price).toBeGreaterThan(0);
		expect(data.trackedSymbols.length).toBeGreaterThan(0);
	});

	test('page has crumb token in app-config', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		const match = html.match(/<script id="app-config" type="application\/json">(.+?)<\/script>/s);
		const config = JSON.parse(match![1]);

		expect(config.crumb).toBeTruthy();
		expect(config.crumb.length).toBeGreaterThan(5);
		expect(config.streamerUrl).toContain('wss://');
	});

	test('REST API requires crumb token from embedded HTML', async () => {
		// Get page to establish session + crumb
		const pageRes = await fetch(baseUrl);
		const html = await pageRes.text();
		const cookie = pageRes.headers.get('set-cookie')!;

		const configMatch = html.match(
			/<script id="app-config" type="application\/json">(.+?)<\/script>/s,
		);
		const config = JSON.parse(configMatch![1]);

		// Without crumb → 401
		const res1 = await fetch(`${baseUrl}/api/quote/DECK-001`, {
			headers: { Cookie: cookie.split(';')[0] },
		});
		expect(res1.status).toBe(401);

		// With crumb → 200
		const res2 = await fetch(`${baseUrl}/api/quote/DECK-001?crumb=${config.crumb}`, {
			headers: { Cookie: cookie.split(';')[0] },
		});
		expect(res2.status).toBe(200);
		const data = await res2.json();
		expect(data.symbol).toBe('DECK-001');
		expect(data.price).toBeGreaterThan(0);
	});

	test('custom elements have data-field and data-value attributes', async () => {
		const res = await fetch(baseUrl);
		const html = await res.text();

		expect(html).toContain('<live-value');
		expect(html).toContain('data-field="price"');
		expect(html).toContain('data-symbol="DECK-001"');
		expect(html).toContain('data-testid="quote-card"');
	});

	test('WebSocket sends protobuf-encoded price updates', async () => {
		const wsUrl = `${server.url.replace('http', 'ws')}/sites/liveboard/stream`;

		const messages: string[] = [];
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(wsUrl);
			const timeout = setTimeout(() => {
				ws.close();
				reject(new Error('WS timeout'));
			}, 5000);

			ws.on('message', (data) => {
				messages.push(data.toString());
				if (messages.length >= 3) {
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

		// First message is connection confirmation
		const first = JSON.parse(messages[0]);
		expect(first.type).toBe('connected');

		// Subsequent messages are protobuf-encoded price updates
		const update = JSON.parse(messages[1]);
		expect(update.type).toBe('pricing');
		expect(update.message).toBeTruthy(); // base64 string

		// Decode the protobuf
		const root = protobufjs.parse(PROTO_DEFINITION).root;
		const PriceUpdate = root.lookupType('boardshop.PriceUpdate');
		const decoded = PriceUpdate.decode(Buffer.from(update.message, 'base64'));
		const obj = PriceUpdate.toObject(decoded);

		expect(obj.sku).toBeTruthy();
		expect(obj.price).toBeGreaterThan(0);
		// timestamp is int64 — protobufjs returns Long object, convert to number
		expect(Number(obj.timestamp)).toBeGreaterThan(0);
	});
});
