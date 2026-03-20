/**
 * Unified DEBUG logging — writes to both console (cyan) and file.
 *
 * All DEBUG() calls from TypeScript and Python converge on the same
 * log file: /tmp/interceptor-debug/debug-YYYY-MM-DD.log
 *
 * Enabled by default in development. Disabled in production and test.
 * Override with DEBUG_LOGGING=true or DEBUG_LOGGING=false.
 *
 * Data is computed lazily — pass a factory function, not an object:
 *   DEBUG('location', 'message', () => ({ key: expensiveCall() }))
 */

import { appendFile, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEBUG_DIR = '/tmp/interceptor-debug';

const DEBUG_ENABLED =
	globalThis.process?.env?.DEBUG_LOGGING === 'true' ||
	(globalThis.process?.env?.NODE_ENV !== 'production' &&
		globalThis.process?.env?.NODE_ENV !== 'test');

type DataFactory = () => Record<string, unknown>;

let dirCreated = false;
function ensureDir(): void {
	if (dirCreated) return;
	if (!existsSync(DEBUG_DIR)) {
		mkdirSync(DEBUG_DIR, { recursive: true });
	}
	dirCreated = true;
}

export function DEBUG(message: string): void;
export function DEBUG(location: string, message: string): void;
export function DEBUG(location: string, dataFactory: DataFactory): void;
export function DEBUG(location: string, message: string, dataFactory: DataFactory): void;
export function DEBUG(arg1: string, arg2?: string | DataFactory, arg3?: DataFactory): void {
	if (!DEBUG_ENABLED) return;

	let location: string | undefined;
	let message: string;
	let dataFactory: DataFactory | undefined;

	if (typeof arg2 === 'function') {
		location = arg1;
		message = 'debug';
		dataFactory = arg2;
	} else if (typeof arg2 === 'string') {
		location = arg1;
		message = arg2;
		dataFactory = arg3;
	} else {
		message = arg1;
	}

	let data: Record<string, unknown> | undefined;
	if (dataFactory) {
		try {
			data = dataFactory();
		} catch (e) {
			data = { _error: (e as Error).message };
		}
	}

	const timestamp = new Date().toISOString();
	const loc = location ? `[${location}] ` : '';
	const dataStr = data ? ` ${JSON.stringify(data)}` : '';
	const line = `[${timestamp}] [DEBUG] ${loc}${message}${dataStr}`;

	console.log(`\x1b[36m${line}\x1b[0m`);

	try {
		ensureDir();
		const date = new Date().toISOString().split('T')[0];
		const file = join(DEBUG_DIR, `debug-${date}.log`);
		appendFile(file, `${line}\n`, () => {}); // async, non-blocking
	} catch {
		// silently fail file writes
	}
}

/**
 * Append a raw line to the debug log file.
 * Used by the bridge to relay Python stderr DEBUG output.
 */
export function appendDebugLog(line: string): void {
	if (!DEBUG_ENABLED) return;
	try {
		ensureDir();
		const date = new Date().toISOString().split('T')[0];
		const file = join(DEBUG_DIR, `debug-${date}.log`);
		appendFile(file, `${line}\n`, () => {}); // async, non-blocking
	} catch {
		// silently fail
	}
}
