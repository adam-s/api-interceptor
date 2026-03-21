/**
 * Layer 2: Classification logic tests.
 * Pure function tests — no browser, no server. Just traffic entries → classification.
 */

import { describe, expect, it } from 'vitest';
import { classifyEntry, classifyPage, type TrafficEntry } from '../classify-transport';

// Helper to create traffic entries
function entry(overrides: Partial<TrafficEntry> & { url: string }): TrafficEntry {
	return {
		method: 'GET',
		status: 200,
		responseHeaders: {},
		...overrides,
	};
}

describe('classifyEntry', () => {
	describe('(a) WebSocket', () => {
		it('classifies ws:// URLs as WEBSOCKET', () => {
			const result = classifyEntry(entry({ url: 'ws://localhost:4444/ws/prices' }));
			expect(result.transport).toBe('WEBSOCKET');
		});

		it('classifies wss:// URLs as WEBSOCKET', () => {
			const result = classifyEntry(entry({ url: 'wss://prices.example.com/stream' }));
			expect(result.transport).toBe('WEBSOCKET');
		});
	});

	describe('(b) GraphQL', () => {
		it('classifies /graphql URL as GRAPHQL', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/graphql',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/json' },
					requestBody: { query: '{ performers { id name } }' },
					responseBody: { data: { performers: [] } },
				}),
			);
			expect(result.transport).toBe('GRAPHQL');
		});

		it('classifies POST with query body as GRAPHQL when URL has /gql', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/gql',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/json' },
					requestBody: { query: 'mutation { createOrder { id } }' },
					responseBody: { data: { createOrder: { id: '123' } } },
				}),
			);
			expect(result.transport).toBe('GRAPHQL');
		});
	});

	describe('(c) gRPC-Web', () => {
		it('classifies application/grpc-web+proto as GRPC_WEB', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/grpc/Service/Method',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/grpc-web+proto' },
				}),
			);
			expect(result.transport).toBe('GRPC_WEB');
		});

		it('classifies application/grpc as GRPC_WEB', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/proto',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/grpc' },
				}),
			);
			expect(result.transport).toBe('GRPC_WEB');
		});
	});

	describe('(d) SSE', () => {
		it('classifies text/event-stream as SSE', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/sse/events',
					responseHeaders: { 'content-type': 'text/event-stream' },
				}),
			);
			expect(result.transport).toBe('SSE');
		});
	});

	describe('(e) JSON API', () => {
		it('classifies application/json response as JSON_API', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/v1/events',
					responseHeaders: { 'content-type': 'application/json' },
					responseBody: { events: [] },
				}),
			);
			expect(result.transport).toBe('JSON_API');
		});

		it('classifies response with object body and no content-type as JSON_API', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/data',
					responseBody: { results: [1, 2, 3] },
				}),
			);
			expect(result.transport).toBe('JSON_API');
		});
	});

	describe('(f) Encoded API', () => {
		it('classifies application/x-protobuf as ENCODED_API with protobuf encoding', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/proto/events',
					responseHeaders: { 'content-type': 'application/x-protobuf' },
				}),
			);
			expect(result.transport).toBe('ENCODED_API');
			expect(result.encoding).toBe('protobuf');
		});

		it('classifies application/x-msgpack as ENCODED_API with msgpack encoding', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/msgpack/events',
					responseHeaders: { 'content-type': 'application/x-msgpack' },
				}),
			);
			expect(result.transport).toBe('ENCODED_API');
			expect(result.encoding).toBe('msgpack');
		});

		it('classifies octet-stream with base64 body as ENCODED_API with base64 encoding', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/data',
					responseHeaders: { 'content-type': 'application/octet-stream' },
					responseBody: 'eyJldmVudHMiOlt7ImlkIjoiRTAwMSJ9XX0=',
				}),
			);
			expect(result.transport).toBe('ENCODED_API');
			expect(result.encoding).toBe('base64');
		});

		it('classifies octet-stream with non-base64 body as ENCODED_API with binary encoding', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/binary',
					responseHeaders: { 'content-type': 'application/octet-stream' },
					responseBody: '\x00\x01\x02binary data',
				}),
			);
			expect(result.transport).toBe('ENCODED_API');
			expect(result.encoding).toBe('binary');
		});
	});

	describe('priority order', () => {
		it('GraphQL URL takes priority over JSON content-type', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/graphql',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/json' },
					requestBody: { query: '{ events { id } }' },
					responseBody: { data: { events: [] } },
				}),
			);
			expect(result.transport).toBe('GRAPHQL');
		});

		it('gRPC-Web takes priority over generic binary', () => {
			const result = classifyEntry(
				entry({
					url: 'https://api.example.com/service',
					method: 'POST',
					responseHeaders: { 'content-type': 'application/grpc-web+proto' },
				}),
			);
			expect(result.transport).toBe('GRPC_WEB');
		});
	});

	describe('filtering', () => {
		it('classifies HTML response as UNKNOWN', () => {
			const result = classifyEntry(
				entry({
					url: 'https://www.example.com/page',
					responseHeaders: { 'content-type': 'text/html' },
				}),
			);
			expect(result.transport).toBe('UNKNOWN');
		});
	});
});

describe('classifyPage', () => {
	it('returns SSR when no data traffic and sufficient wait time', () => {
		const result = classifyPage([], { waitTimeMs: 20000 });
		expect(result.transports).toContain('SSR');
		expect(result.hasDataTraffic).toBe(false);
	});

	it('warns when no traffic but wait time is short', () => {
		const result = classifyPage([], { waitTimeMs: 5000 });
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain('Wait time');
	});

	it('warns critically when loading state but no traffic', () => {
		const result = classifyPage([], { hasLoadingState: true, waitTimeMs: 20000 });
		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain('CRITICAL');
	});

	it('detects hybrid when XHR exists and loading state was seen', () => {
		const entries: TrafficEntry[] = [
			entry({
				url: 'https://api.example.com/tickets',
				responseHeaders: { 'content-type': 'application/json' },
				responseBody: { tickets: [] },
			}),
		];
		const result = classifyPage(entries, { hasLoadingState: true });
		expect(result.isHybrid).toBe(true);
		expect(result.transports).toContain('HYBRID');
	});

	it('filters out analytics/tracking traffic', () => {
		const entries: TrafficEntry[] = [
			entry({ url: 'https://www.google-analytics.com/collect' }),
			entry({ url: 'https://segment.io/v1/track' }),
			entry({ url: 'https://cdn.sentry.io/error' }),
			entry({
				url: 'https://api.example.com/data',
				responseHeaders: { 'content-type': 'application/json' },
				responseBody: { items: [] },
			}),
		];
		const result = classifyPage(entries);
		// Only the real API entry should be classified
		expect(result.entries.length).toBe(1);
		expect(result.entries[0].transport).toBe('JSON_API');
	});

	it('filters out static assets', () => {
		const entries: TrafficEntry[] = [
			entry({ url: 'https://cdn.example.com/main.js' }),
			entry({ url: 'https://cdn.example.com/style.css' }),
			entry({ url: 'https://cdn.example.com/logo.png' }),
			entry({
				url: 'https://api.example.com/events',
				responseHeaders: { 'content-type': 'application/json' },
				responseBody: { events: [] },
			}),
		];
		const result = classifyPage(entries);
		expect(result.entries.length).toBe(1);
		expect(result.transports).toEqual(['JSON_API']);
	});

	it('identifies multiple transport types on same page', () => {
		const entries: TrafficEntry[] = [
			entry({
				url: 'https://api.example.com/events',
				responseHeaders: { 'content-type': 'application/json' },
				responseBody: { events: [] },
			}),
			entry({
				url: 'https://api.example.com/proto/prices',
				responseHeaders: { 'content-type': 'application/x-protobuf' },
			}),
		];
		const result = classifyPage(entries);
		expect(result.transports).toContain('JSON_API');
		expect(result.transports).toContain('ENCODED_API');
	});
});
