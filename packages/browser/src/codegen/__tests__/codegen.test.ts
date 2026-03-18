/**
 * Tests for API client code generator
 */

import { describe, expect, it } from 'vitest';
import { generateClientFile } from '../client-codegen';
import { inferSchemaFromExamples } from '../schema-inferencer';
import { analyzeTraffic, normalizeUrl, type TrafficEntry } from '../traffic-analyzer';

describe('Traffic Analyzer', () => {
	it('should normalize UUIDs to {id}', () => {
		const url = 'https://api.boardshop.com/accounts/550e8400-e29b-41d4-a716-446655440000/positions';
		const normalized = normalizeUrl(url);
		expect(normalized).toBe('https://api.boardshop.com/accounts/{id}/positions');
	});

	it('should normalize numeric IDs to {id}', () => {
		const url = 'https://api.boardshop.com/accounts/12345/positions';
		const normalized = normalizeUrl(url);
		expect(normalized).toBe('https://api.boardshop.com/accounts/{id}/positions');
	});

	it('should remove query strings', () => {
		const url = 'https://api.boardshop.com/accounts?page=1&limit=10';
		const normalized = normalizeUrl(url);
		expect(normalized).toBe('https://api.boardshop.com/accounts');
	});

	it('should analyze traffic and group by endpoint', () => {
		const entries: TrafficEntry[] = [
			{
				id: 1,
				timestamp: 1000,
				method: 'GET',
				url: 'https://api.boardshop.com/accounts/',
				requestHeaders: { Authorization: 'Bearer token' },
				requestBody: undefined,
				status: 200,
				responseHeaders: {},
				responseBody: { results: [{ account_number: '123' }] },
				durationMs: 100,
			},
			{
				id: 2,
				timestamp: 1100,
				method: 'GET',
				url: 'https://api.boardshop.com/accounts/',
				requestHeaders: { Authorization: 'Bearer token' },
				requestBody: undefined,
				status: 200,
				responseHeaders: {},
				responseBody: { results: [{ account_number: '456' }] },
				durationMs: 120,
			},
			{
				id: 3,
				timestamp: 1200,
				method: 'GET',
				url: 'https://api.boardshop.com/accounts/',
				requestHeaders: { Authorization: 'Bearer token' },
				requestBody: undefined,
				status: 200,
				responseHeaders: {},
				responseBody: { results: [{ account_number: '789' }] },
				durationMs: 110,
			},
		];

		const patterns = analyzeTraffic(entries);

		expect(patterns).toHaveLength(1);
		expect(patterns[0].method).toBe('GET');
		expect(patterns[0].pattern).toBe('https://api.boardshop.com/accounts/');
		expect(patterns[0].examples).toHaveLength(3);
		expect(patterns[0].canInferSchema).toBe(true);
	});

	it('should skip failed requests', () => {
		const entries: TrafficEntry[] = [
			{
				id: 1,
				timestamp: 1000,
				method: 'GET',
				url: 'https://api.boardshop.com/accounts/',
				requestHeaders: {},
				requestBody: undefined,
				status: 401,
				responseHeaders: {},
				responseBody: { error: 'Unauthorized' },
				durationMs: 100,
			},
		];

		const patterns = analyzeTraffic(entries);
		expect(patterns).toHaveLength(0);
	});
});

describe('Schema Inferencer', () => {
	it('should infer object schema', () => {
		const examples = [
			{ name: 'John', age: 30 },
			{ name: 'Jane', age: 25 },
		];

		const schema = inferSchemaFromExamples(examples);
		expect(schema).toContain('object');
		expect(schema).toContain('name');
		expect(schema).toContain('age');
	});

	it('should handle arrays', () => {
		const examples = [
			{ results: [{ id: 1 }, { id: 2 }] },
			{ results: [{ id: 3 }, { id: 4 }, { id: 5 }] },
		];

		const schema = inferSchemaFromExamples(examples);
		expect(schema).toContain('array');
		expect(schema).toContain('results');
	});

	it('should handle nullable fields', () => {
		const examples = [
			{ name: 'John', nickname: 'Johnny' },
			{ name: 'Jane', nickname: null },
		];

		const schema = inferSchemaFromExamples(examples);
		expect(schema).toContain('nickname');
	});

	it('should return z.unknown() for empty examples', () => {
		const schema = inferSchemaFromExamples([]);
		expect(schema).toBe('z.unknown()');
	});
});

describe('Client Code Generator', () => {
	it('should generate valid TypeScript client', () => {
		const config = {
			domainName: 'test',
			className: 'TestApiClient',
			baseUrls: ['https://api.example.com'],
			requiredHeaders: ['Authorization'],
			endpoints: [
				{
					method: 'GET',
					pattern: '/users/',
					baseUrl: 'https://api.example.com',
					examples: [],
					minExamples: 3,
					canInferSchema: true,
				},
				{
					method: 'POST',
					pattern: '/users/',
					baseUrl: 'https://api.example.com',
					examples: [],
					minExamples: 3,
					canInferSchema: true,
				},
			],
		};

		const code = generateClientFile(config);

		expect(code).toContain('class TestApiClient');
		expect(code).toContain('constructor(headers');
		expect(code).toContain('async getUsers');
		expect(code).toContain('async createUsers');
		expect(code).toContain('Authorization');
	});

	it('should generate code with proper imports', () => {
		const config = {
			domainName: 'boardshop',
			className: 'BoardshopApiClient',
			baseUrls: ['https://api.boardshop.com'],
			requiredHeaders: ['Authorization', 'X-Api-Version'],
			endpoints: [],
		};

		const code = generateClientFile(config);

		expect(code).toContain('Auto-generated API client');
		expect(code).toContain('boardshop');
		expect(code).toContain('BoardshopApiClient');
	});
});
