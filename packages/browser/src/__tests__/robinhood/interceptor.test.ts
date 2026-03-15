import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RobinhoodInterceptor } from '../../robinhood/interceptor';

describe('RobinhoodInterceptor', () => {
	let interceptor: RobinhoodInterceptor;

	beforeEach(() => {
		interceptor = new RobinhoodInterceptor();
	});

	describe('getHeaders', () => {
		it('returns null when no headers captured', () => {
			const headers = interceptor.getHeaders();
			expect(headers).toBeNull();
		});

		it('returns null when only some headers captured', () => {
			// Access private method via any cast for testing
			const int = interceptor as unknown as {
				capturedHeaders: Map<string, string>;
			};
			int.capturedHeaders.set('Authorization', 'Bearer token');
			// Missing other required headers

			const headers = interceptor.getHeaders();
			expect(headers).toBeNull();
		});
	});

	describe('hasHeaders', () => {
		it('returns false when no headers', () => {
			expect(interceptor.hasHeaders()).toBe(false);
		});
	});

	describe('clearHeaders', () => {
		it('clears captured headers', () => {
			const int = interceptor as unknown as {
				capturedHeaders: Map<string, string>;
			};
			int.capturedHeaders.set('Authorization', 'Bearer token');
			int.capturedHeaders.set('X-Hyper-Ex', 'test');

			interceptor.clearHeaders();

			expect(int.capturedHeaders.size).toBe(0);
		});
	});

	describe('onIntercept', () => {
		it('registers and returns unsubscribe function', () => {
			const callback = vi.fn();
			const unsubscribe = interceptor.onIntercept(callback);

			expect(typeof unsubscribe).toBe('function');

			// Call unsubscribe
			unsubscribe();

			// Verify callback was removed
			const int = interceptor as unknown as {
				callbacks: Set<unknown>;
			};
			expect(int.callbacks.has(callback)).toBe(false);
		});
	});

	describe('waitForHeaders', () => {
		it('returns null after timeout when no headers captured', async () => {
			const result = await interceptor.waitForHeaders(100);
			expect(result).toBeNull();
		});

		it('returns headers immediately if already captured', async () => {
			// Set up all required headers
			const int = interceptor as unknown as {
				capturedHeaders: Map<string, string>;
			};
			int.capturedHeaders.set('Authorization', 'Bearer test-token');
			int.capturedHeaders.set('X-Hyper-Ex', 'hyper-ex-value');
			int.capturedHeaders.set('X-Robinhood-API-Version', '1.0.0');
			int.capturedHeaders.set('X-TimeZone-Id', 'America/New_York');

			const result = await interceptor.waitForHeaders(1000);

			expect(result).not.toBeNull();
			expect(result?.Authorization).toBe('Bearer test-token');
		});
	});

	describe('onHeadersCaptured callback', () => {
		it('can be set and retrieved', () => {
			const callback = vi.fn();
			interceptor.onHeadersCaptured = callback;

			expect(interceptor.onHeadersCaptured).toBe(callback);
		});
	});
});

describe('RobinhoodInterceptor header extraction', () => {
	let interceptor: RobinhoodInterceptor;

	beforeEach(() => {
		interceptor = new RobinhoodInterceptor();
	});

	// Test the extractHeaders private method indirectly through the public API
	describe('header validation', () => {
		it('validates Authorization header format', () => {
			const int = interceptor as unknown as {
				capturedHeaders: Map<string, string>;
			};

			// Set up all headers with invalid Authorization
			int.capturedHeaders.set('Authorization', 'InvalidToken');
			int.capturedHeaders.set('X-Hyper-Ex', 'hyper-ex-value');
			int.capturedHeaders.set('X-Robinhood-API-Version', '1.0.0');
			int.capturedHeaders.set('X-TimeZone-Id', 'America/New_York');

			// Should fail validation because Authorization doesn't start with "Bearer "
			const headers = interceptor.getHeaders();
			expect(headers).toBeNull();
		});

		it('accepts valid Bearer token format', () => {
			const int = interceptor as unknown as {
				capturedHeaders: Map<string, string>;
			};

			int.capturedHeaders.set('Authorization', 'Bearer valid-token-12345');
			int.capturedHeaders.set('X-Hyper-Ex', 'hyper-ex-value');
			int.capturedHeaders.set('X-Robinhood-API-Version', '1.315.0');
			int.capturedHeaders.set('X-TimeZone-Id', 'America/New_York');

			const headers = interceptor.getHeaders();
			expect(headers).not.toBeNull();
			expect(headers?.Authorization).toBe('Bearer valid-token-12345');
			expect(headers?.['X-Hyper-Ex']).toBe('hyper-ex-value');
		});
	});
});
