/**
 * WebSocket transport — supports JSON frames, protobuf frames, and IRC-like text frames.
 */

import type { WebSocket } from 'ws';
import { CHAT_MESSAGES } from '../data/media';
import { generatePriceUpdate } from '../data/prices';
import { encodePriceUpdate } from './protobuf';

export type WSMode = 'json' | 'protobuf' | 'irc';

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
		// Wrap in JSON with base64 message (like Yahoo Finance)
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
	// IRC handshake
	ws.on('message', (data) => {
		const text = data.toString();
		if (text.startsWith('CAP REQ')) {
			ws.send(`:tmi.testserver.tv CAP * ACK :testserver.tv/tags testserver.tv/commands\r\n`);
		} else if (text.startsWith('NICK')) {
			ws.send(`:tmi.testserver.tv 001 ${text.split(' ')[1]} :Welcome\r\n`);
		} else if (text.startsWith('JOIN')) {
			ws.send(`:testuser!testuser@testuser.tmi.testserver.tv JOIN #${channel}\r\n`);
			// Start streaming chat messages
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
