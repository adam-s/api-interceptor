/**
 * WebSocket transport — supports JSON, protobuf, IRC, GraphQL subscription,
 * and custom binary frame modes.
 */

import type { WebSocket } from 'ws';
import { CHAT_MESSAGES } from '../data/media';
import { generatePriceUpdate } from '../data/prices';
import { PRODUCTS } from '../data/products';
import { encodePriceUpdate } from './protobuf';

export type WSMode = 'json' | 'protobuf' | 'irc' | 'graphql-ws' | 'binary';

export interface WSRoute {
	path: string;
	mode: WSMode;
	/** For IRC mode: channel name */
	channel?: string;
}

export function handleWSUpgrade(ws: WebSocket, route: WSRoute): void {
	if (route.mode === 'json') {
		handleJsonWS(ws);
	} else if (route.mode === 'protobuf') {
		handleProtobufWS(ws);
	} else if (route.mode === 'irc') {
		handleIrcWS(ws, route.channel ?? 'general');
	} else if (route.mode === 'graphql-ws') {
		handleGraphqlWS(ws);
	} else if (route.mode === 'binary') {
		handleBinaryWS(ws);
	}
}

function handleJsonWS(ws: WebSocket): void {
	ws.send(JSON.stringify({ type: 'connected', transport: 'websocket-json' }));

	const interval = setInterval(() => {
		if (ws.readyState !== 1) {
			clearInterval(interval);
			return;
		}
		const update = generatePriceUpdate();
		ws.send(JSON.stringify({ type: 'price_update', data: update }));
	}, 500);

	ws.on('close', () => clearInterval(interval));
	ws.on('error', () => clearInterval(interval));
}

function handleProtobufWS(ws: WebSocket): void {
	ws.send(JSON.stringify({ type: 'connected', transport: 'websocket-protobuf' }));

	const interval = setInterval(() => {
		if (ws.readyState !== 1) {
			clearInterval(interval);
			return;
		}
		const update = generatePriceUpdate();
		const encoded = encodePriceUpdate({
			sku: update.sku,
			price: update.price,
			timestamp: update.timestamp,
			change: update.change,
			changePercent: update.changePercent,
			volume: update.volume,
		});
		const frame = JSON.stringify({
			type: 'pricing',
			message: Buffer.from(encoded).toString('base64'),
		});
		ws.send(frame);
	}, 500);

	ws.on('close', () => clearInterval(interval));
	ws.on('error', () => clearInterval(interval));
}

function handleIrcWS(ws: WebSocket, channel: string): void {
	ws.on('message', (data) => {
		const text = data.toString();
		if (text.startsWith('CAP REQ')) {
			ws.send(`:tmi.testserver.tv CAP * ACK :testserver.tv/tags testserver.tv/commands\r\n`);
		} else if (text.startsWith('NICK')) {
			ws.send(`:tmi.testserver.tv 001 ${text.split(' ')[1]} :Welcome\r\n`);
		} else if (text.startsWith('JOIN')) {
			ws.send(`:testuser!testuser@testuser.tmi.testserver.tv JOIN #${channel}\r\n`);
			startChatStream(ws, channel);
		} else if (text.startsWith('PING')) {
			ws.send('PONG :tmi.testserver.tv\r\n');
		}
	});
}

function startChatStream(ws: WebSocket, channel: string): void {
	let idx = 0;
	const interval = setInterval(() => {
		if (ws.readyState !== 1) {
			clearInterval(interval);
			return;
		}
		const msg = CHAT_MESSAGES[idx % CHAT_MESSAGES.length];
		ws.send(
			`:${msg.user}!${msg.user}@${msg.user}.tmi.testserver.tv PRIVMSG #${channel} :${msg.message}\r\n`,
		);
		idx++;
	}, 800);

	ws.on('close', () => clearInterval(interval));
	ws.on('error', () => clearInterval(interval));
}

// ─── GraphQL subscription over WebSocket ────────────────────────────
// Implements the graphql-ws protocol: connection_init → connection_ack
// → subscribe → next (data) → complete
function handleGraphqlWS(ws: WebSocket): void {
	ws.on('message', (data) => {
		const msg = JSON.parse(data.toString()) as {
			type: string;
			id?: string;
			payload?: { query?: string; variables?: Record<string, unknown> };
		};

		if (msg.type === 'connection_init') {
			ws.send(JSON.stringify({ type: 'connection_ack' }));
		} else if (msg.type === 'subscribe' && msg.id && msg.payload) {
			// Send periodic updates as subscription data
			let idx = 0;
			const interval = setInterval(() => {
				if (ws.readyState !== 1) {
					clearInterval(interval);
					return;
				}
				const update = generatePriceUpdate();
				ws.send(
					JSON.stringify({
						id: msg.id,
						type: 'next',
						payload: {
							data: {
								priceUpdate: {
									sku: update.sku,
									price: update.price,
									change: update.change,
									timestamp: update.timestamp,
								},
							},
						},
					}),
				);
				idx++;
				if (idx >= 20) {
					clearInterval(interval);
					ws.send(JSON.stringify({ id: msg.id, type: 'complete' }));
				}
			}, 600);

			ws.on('close', () => clearInterval(interval));
		}
	});
}

// ─── Custom binary frame WebSocket ──────────────────────────────────
// Sends raw binary frames (not JSON-wrapped). Agents must detect the
// frame format from JS bundles and decode accordingly.
// Frame format: [1 byte type][2 bytes length BE][payload]
//   type 0x01 = product update (payload: UTF-8 JSON)
//   type 0x02 = heartbeat (no payload)
function handleBinaryWS(ws: WebSocket): void {
	ws.send(Buffer.from([0x02, 0x00, 0x00])); // heartbeat

	let idx = 0;
	const interval = setInterval(() => {
		if (ws.readyState !== 1) {
			clearInterval(interval);
			return;
		}
		const product = PRODUCTS[idx % PRODUCTS.length];
		const payload = Buffer.from(
			JSON.stringify({ sku: product.sku, price: product.price, stock: product.stock }),
		);
		const frame = Buffer.alloc(3 + payload.length);
		frame[0] = 0x01; // product update type
		frame.writeUInt16BE(payload.length, 1);
		payload.copy(frame, 3);
		ws.send(frame);
		idx++;
	}, 700);

	ws.on('close', () => clearInterval(interval));
	ws.on('error', () => clearInterval(interval));
}
