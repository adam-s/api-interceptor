// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * Server-Sent Events Transport — event stream endpoint.
 * Priority (d) in the decision tree.
 *
 * Client connects to /sse/events, receives a stream of event updates.
 * Simulates how some sites push live updates via SSE instead of WebSocket.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EVENTS, PRICE_UPDATES } from '../data.js';

export function createSSERoutes(): Hono {
	const app = new Hono();

	// SSE price stream — sends price updates as server-sent events
	app.get('/sse/prices', (c) => {
		return streamSSE(c, async (stream) => {
			// Send initial snapshot
			await stream.writeSSE({
				event: 'snapshot',
				data: JSON.stringify({
					events: EVENTS.map((e) => ({
						id: e.id,
						name: e.name,
						minPrice: Math.min(...e.tickets.map((t) => t.price)),
					})),
				}),
			});

			// Stream price updates
			for (const update of PRICE_UPDATES) {
				await new Promise((r) => setTimeout(r, 300));
				await stream.writeSSE({
					event: 'price_update',
					data: JSON.stringify(update),
					id: `pu-${update.eventId}-${update.timestamp}`,
				});
			}

			// Signal end of stream for testing
			await stream.writeSSE({
				event: 'done',
				data: JSON.stringify({ message: 'Stream complete' }),
			});
		});
	});

	return app;
}
