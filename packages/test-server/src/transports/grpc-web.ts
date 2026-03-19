// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * gRPC-Web Transport — binary protobuf over HTTP with gRPC-Web framing.
 * Priority (c) in the decision tree.
 *
 * Simulates the gRPC-Web wire format:
 * - Content-Type: application/grpc-web+proto
 * - Request: 5-byte header (compressed flag + 4-byte length) + protobuf body
 * - Response: 5-byte header + protobuf body + trailers frame
 *
 * This is distinct from regular protobuf (which is just raw binary).
 * gRPC-Web adds framing that the agent must recognize and strip.
 */

import { Hono } from 'hono';
import protobuf from 'protobufjs';
import { EVENTS, PERFORMERS } from '../data.js';
import { PROTO_DEFINITION } from './encoded-protobuf.js';

let root: protobuf.Root | null = null;

async function getRoot(): Promise<protobuf.Root> {
	if (!root) {
		root = protobuf.parse(PROTO_DEFINITION).root;
	}
	return root;
}

/**
 * Wrap a protobuf buffer in gRPC-Web framing.
 * Frame format: 1 byte flags (0 = data) + 4 byte big-endian length + payload
 */
function grpcWebFrame(data: Uint8Array): Uint8Array {
	const frame = new Uint8Array(5 + data.length);
	frame[0] = 0; // flags: not compressed
	const view = new DataView(frame.buffer);
	view.setUint32(1, data.length, false); // big-endian length
	frame.set(data, 5);
	return frame;
}

/**
 * Create gRPC-Web trailer frame (status OK).
 */
function grpcWebTrailers(): Uint8Array {
	const trailerText = 'grpc-status:0\r\ngrpc-message:OK\r\n';
	const trailerBytes = new TextEncoder().encode(trailerText);
	const frame = new Uint8Array(5 + trailerBytes.length);
	frame[0] = 0x80; // flags: trailer frame
	const view = new DataView(frame.buffer);
	view.setUint32(1, trailerBytes.length, false);
	frame.set(trailerBytes, 5);
	return frame;
}

export function createGrpcWebRoutes(): Hono {
	const app = new Hono();

	// gRPC-Web: ListPerformers
	app.post('/grpc/testserver.EventService/ListPerformers', async (c) => {
		const r = await getRoot();
		const PerformerList = r.lookupType('testserver.PerformerList');

		const message = PerformerList.create({
			performers: PERFORMERS.map((p) => ({
				id: p.id,
				name: p.name,
				category: p.category,
				imageUrl: p.imageUrl,
				eventCount: p.eventCount,
			})),
		});
		const encoded = PerformerList.encode(message).finish();

		const dataFrame = grpcWebFrame(encoded);
		const trailerFrame = grpcWebTrailers();

		const response = new Uint8Array(dataFrame.length + trailerFrame.length);
		response.set(dataFrame, 0);
		response.set(trailerFrame, dataFrame.length);

		return c.body(new Uint8Array(response) as Uint8Array<ArrayBuffer>, 200, {
			'Content-Type': 'application/grpc-web+proto',
			'Grpc-Accept-Encoding': 'identity',
		});
	});

	// gRPC-Web: ListEvents
	app.post('/grpc/testserver.EventService/ListEvents', async (c) => {
		const r = await getRoot();
		const EventList = r.lookupType('testserver.EventList');

		// Try to read performerId from request body (gRPC-Web framed protobuf)
		// For simplicity, just return all events
		const message = EventList.create({
			events: EVENTS.map((e) => ({
				id: e.id,
				performerId: e.performerId,
				name: e.name,
				venue: e.venue,
				date: e.date,
				category: e.category,
				tickets: e.tickets.map((t) => ({
					section: t.section,
					row: t.row,
					price: t.price,
					currency: t.currency,
					quantity: t.quantity,
				})),
			})),
		});
		const encoded = EventList.encode(message).finish();

		const dataFrame = grpcWebFrame(encoded);
		const trailerFrame = grpcWebTrailers();

		const response = new Uint8Array(dataFrame.length + trailerFrame.length);
		response.set(dataFrame, 0);
		response.set(trailerFrame, dataFrame.length);

		return c.body(new Uint8Array(response) as Uint8Array<ArrayBuffer>, 200, {
			'Content-Type': 'application/grpc-web+proto',
			'Grpc-Accept-Encoding': 'identity',
		});
	});

	return app;
}
