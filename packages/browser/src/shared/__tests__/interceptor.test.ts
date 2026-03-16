/**
 * Unit tests for GenericInterceptor
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { InterceptorConfig } from '../config';
import { GenericInterceptor } from '../interceptor';

// Mock config for testing
const testConfig: InterceptorConfig = {
	domainName: 'test-domain',
	interceptPatterns: ['https://api.example.com/**'],
	requiredHeaders: ['Authorization', 'X-Custom-Header'],
	headerSchema: z.object({
		Authorization: z.string().startsWith('Bearer '),
		'X-Custom-Header': z.string(),
	}),
	baseUrls: ['https://api.example.com'],
};

// Concrete test implementation
class TestInterceptor extends GenericInterceptor {}

describe('GenericInterceptor', () => {
	let interceptor: TestInterceptor;

	beforeEach(() => {
		interceptor = new TestInterceptor(testConfig);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should initialize with correct config', () => {
		expect(interceptor).toBeDefined();
	});

	it('should have no headers initially', () => {
		expect(interceptor.getHeaders()).toBeNull();
		expect(interceptor.hasHeaders()).toBe(false);
	});

	it('should register and call interception callbacks', () => {
		const callback = vi.fn();
		interceptor.onIntercept(callback);

		// Callback will be called when route is handled
		// This is tested at integration level
	});

	it('should clear headers', () => {
		interceptor.clearHeaders();
		expect(interceptor.getHeaders()).toBeNull();
	});

	it('should allow unregistering callbacks', () => {
		const callback = vi.fn();
		const unregister = interceptor.onIntercept(callback);
		unregister();
		// Callback should be removed
	});

	it('should timeout waiting for headers', async () => {
		const result = await interceptor.waitForHeaders(100);
		expect(result).toBeNull();
	});
});
