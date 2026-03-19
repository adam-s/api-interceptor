// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * MessagePack-Encoded Transport — XHR returns msgpack binary.
 * Priority (f) in the decision tree — ENCODED API.
 *
 * Simulates sites that use MessagePack for compact binary serialization.
 * Common in high-performance APIs (gaming, real-time data).
 */

import { Hono } from 'hono';
import { encode } from '@msgpack/msgpack';
import { EVENTS, PERFORMERS } from '../data.js';

export function createMsgpackRoutes(): Hono {
	const app = new Hono();

	// Search performers — response is msgpack binary
	app.get('/api/encoded/msgpack/performers', (c) => {
		const q = (c.req.query('q') ?? '').toLowerCase();
		const matches = q
			? PERFORMERS.filter((p) => p.name.toLowerCase().includes(q))
			: PERFORMERS;

		const packed = encode({ performers: matches });

		return c.body(new Uint8Array(packed) as Uint8Array<ArrayBuffer>, 200, {
			'Content-Type': 'application/x-msgpack',
		});
	});

	// Events — response is msgpack binary
	app.get('/api/encoded/msgpack/events/:performerId', (c) => {
		const performerId = c.req.param('performerId');
		const performer = PERFORMERS.find((p) => p.id === performerId);
		if (!performer) {
			return c.body(new Uint8Array(encode({ error: 'Not found' })) as Uint8Array<ArrayBuffer>, 404, {
				'Content-Type': 'application/x-msgpack',
			});
		}

		const events = EVENTS.filter((e) =>
			e.performerId === performerId,
		);
		const packed = encode({ events });

		return c.body(new Uint8Array(packed) as Uint8Array<ArrayBuffer>, 200, {
			'Content-Type': 'application/x-msgpack',
		});
	});

	// Tickets — response is msgpack binary
	app.get('/api/encoded/msgpack/tickets/:eventId', (c) => {
		const eventId = c.req.param('eventId');
		const event = EVENTS.find((e) => e.id === eventId);
		if (!event) {
			return c.body(new Uint8Array(encode({ error: 'Not found' })) as Uint8Array<ArrayBuffer>, 404, {
				'Content-Type': 'application/x-msgpack',
			});
		}

		const packed = encode({ tickets: event.tickets });

		return c.body(new Uint8Array(packed) as Uint8Array<ArrayBuffer>, 200, {
			'Content-Type': 'application/x-msgpack',
		});
	});

	return app;
}
