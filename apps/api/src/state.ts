// === DEMO: multiplier-panel WebSocket state ===
// Used by the multiplier-panel dashboard page for testing WebSocket infra.
// Not used by domain proxy routes or API interception.

import type { WSContext } from 'hono/ws';

// --- Mutable server-side state ---

let multiplier = 1;
let count = 0;
let running = true;
let tickInterval: ReturnType<typeof setInterval> | null = null;
let lastJson = '';
let history: number[] = [];

const MAX_HISTORY = 20;

// --- Client tracking ---

export interface WsClient {
	ws: WSContext;
	closed: boolean;
}

const clients = new Set<WsClient>();

// --- Public API ---

export interface State {
	multiplier: number;
	count: number;
	running: boolean;
	connections: number;
	updatedAt: string;
	history: number[];
}

export function getState(): State {
	return {
		multiplier,
		count,
		running,
		connections: clients.size,
		updatedAt: new Date().toISOString(),
		history,
	};
}

export function setMultiplier(value: number): State {
	multiplier = Math.max(-10, Math.min(10, value));
	broadcast();
	return getState();
}

export function resetState(): State {
	multiplier = 1;
	count = 0;
	running = true;
	lastJson = '';
	history = [];
	stopTick();
	if (clients.size > 0) startTick();
	broadcast();
	return getState();
}

export function setRunning(value: boolean): State {
	running = value;
	if (running) {
		startTick();
	} else {
		stopTick();
	}
	broadcast();
	return getState();
}

export function addClient(ws: WSContext): WsClient {
	const client: WsClient = { ws, closed: false };
	clients.add(client);
	// Send current state immediately on connect
	sendTo(client, getState());
	// Start tick if this is the first client and we're running
	if (clients.size === 1 && running) {
		startTick();
	}
	return client;
}

export function removeClient(client: WsClient): void {
	client.closed = true;
	clients.delete(client);
	// Stop tick if no clients left
	if (clients.size === 0) {
		stopTick();
	}
}

// --- For testing ---

export function _reset(): void {
	multiplier = 1;
	count = 0;
	running = true;
	lastJson = '';
	history = [];
	stopTick();
	clients.clear();
}

export function _getClients(): Set<WsClient> {
	return clients;
}

// --- Internal ---

function tick(): void {
	count += multiplier;
	history = [...history, count].slice(-MAX_HISTORY);
	broadcast();
}

function startTick(): void {
	if (tickInterval !== null) return;
	tickInterval = setInterval(tick, 1000);
}

function stopTick(): void {
	if (tickInterval !== null) {
		clearInterval(tickInterval);
		tickInterval = null;
	}
}

function broadcast(): void {
	const state = getState();
	const json = JSON.stringify({ type: 'state', data: state });
	// Dedup: don't send if nothing changed (prevents React flashing)
	if (json === lastJson) return;
	lastJson = json;

	for (const client of clients) {
		sendTo(client, state);
	}
}

function sendTo(client: WsClient, state: State): void {
	if (client.closed) return;
	try {
		client.ws.send(JSON.stringify({ type: 'state', data: state }));
	} catch {
		// Client disconnected — remove silently
		client.closed = true;
		clients.delete(client);
	}
}

/**
 * Broadcast an arbitrary JSON message to all connected WS clients.
 * Used by domain pollers (e.g., news:update) to push data without going
 * through the state machine.
 */
export function broadcastMessage(payload: unknown): void {
	const json = JSON.stringify(payload);
	for (const client of clients) {
		if (client.closed) continue;
		try {
			client.ws.send(json);
		} catch {
			client.closed = true;
			clients.delete(client);
		}
	}
}
