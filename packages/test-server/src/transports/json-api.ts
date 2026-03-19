// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * JSON API Transport — plain REST endpoints returning application/json.
 * This is the simplest transport type (Priority e in the decision tree).
 */

import { Hono } from 'hono';
import { EVENTS, PERFORMERS } from '../data.js';

export function createJsonApiRoutes(): Hono {
	const app = new Hono();

	// Search performers by query
	app.get('/api/json/performers', (c) => {
		const q = (c.req.query('q') ?? '').toLowerCase();
		if (!q) return c.json({ performers: PERFORMERS });
		const matches = PERFORMERS.filter((p) =>
			p.name.toLowerCase().includes(q),
		);
		return c.json({ performers: matches });
	});

	// Get events for a performer
	app.get('/api/json/events/:performerId', (c) => {
		const performerId = c.req.param('performerId');
		const performer = PERFORMERS.find((p) => p.id === performerId);
		if (!performer) return c.json({ error: 'Performer not found' }, 404);

		const events = EVENTS.filter((e) =>
			e.performerId === performerId,
		);
		return c.json({ events, performer });
	});

	// Get tickets for an event
	app.get('/api/json/tickets/:eventId', (c) => {
		const eventId = c.req.param('eventId');
		const event = EVENTS.find((e) => e.id === eventId);
		if (!event) return c.json({ error: 'Event not found' }, 404);
		return c.json({ tickets: event.tickets, event: { id: event.id, name: event.name } });
	});

	return app;
}
