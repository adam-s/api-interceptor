import { existsSync, readFileSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Test the shared DEBUG (Node.js, file-writing) not the browser-safe stub.
// The browser-safe ./debug.ts is console-only and has no file logic to test.
const DEBUG_DIR = '/tmp/interceptor-debug';

describe('debug', () => {
	beforeEach(() => {
		if (existsSync(DEBUG_DIR)) {
			rmSync(DEBUG_DIR, { recursive: true });
		}
		vi.resetModules();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		if (existsSync(DEBUG_DIR)) {
			rmSync(DEBUG_DIR, { recursive: true });
		}
	});

	it('is disabled when NODE_ENV is test (default)', async () => {
		const { DEBUG } = await import('@interceptor/shared');
		DEBUG('should not write');
		expect(existsSync(DEBUG_DIR)).toBe(false);
	});

	it('writes to file when DEBUG_LOGGING=true', async () => {
		vi.stubEnv('DEBUG_LOGGING', 'true');
		const { DEBUG } = await import('@interceptor/shared');

		DEBUG('test message');

		// appendFile is async — give it a tick
		await new Promise((r) => setTimeout(r, 50));

		const date = new Date().toISOString().split('T')[0];
		const logFile = `${DEBUG_DIR}/debug-${date}.log`;
		expect(existsSync(logFile)).toBe(true);
		const content = readFileSync(logFile, 'utf-8');
		expect(content).toContain('test message');
	});

	it('formats location and data correctly', async () => {
		vi.stubEnv('DEBUG_LOGGING', 'true');
		const { DEBUG } = await import('@interceptor/shared');

		DEBUG('myFunc', 'hello', () => ({ count: 42 }));

		await new Promise((r) => setTimeout(r, 50));

		const date = new Date().toISOString().split('T')[0];
		const logFile = `${DEBUG_DIR}/debug-${date}.log`;
		const content = readFileSync(logFile, 'utf-8');
		expect(content).toContain('[myFunc]');
		expect(content).toContain('hello');
		expect(content).toContain('"count":42');
	});

	it('handles data factory errors gracefully', async () => {
		vi.stubEnv('DEBUG_LOGGING', 'true');
		const { DEBUG } = await import('@interceptor/shared');

		DEBUG('errorTest', 'oops', () => {
			throw new Error('boom');
		});

		await new Promise((r) => setTimeout(r, 50));

		const date = new Date().toISOString().split('T')[0];
		const logFile = `${DEBUG_DIR}/debug-${date}.log`;
		const content = readFileSync(logFile, 'utf-8');
		expect(content).toContain('_error');
		expect(content).toContain('boom');
	});
});
