/**
 * Browser Module Logger
 *
 * Structured logging for the browser streaming service.
 * Logs are written to both console and file for debugging crashes.
 *
 * Strategic log points:
 * - Browser lifecycle events (start, stop, crash)
 * - Profile changes
 * - WebSocket connection events
 * - Errors and exceptions
 *
 * NOT logged (to reduce noise):
 * - Individual frame sends
 * - Mouse movements
 * - Frequent heartbeats
 *
 * @module browser/remote
 */

import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Log file location - uses data directory in development, /var/log in production
const LOG_DIR = process.env.NODE_ENV === 'production' ? '/var/log/interceptor' : './data/logs';
const LOG_FILE = join(LOG_DIR, 'browser.log');

// Ensure log directory exists
function ensureLogDir(): void {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
}

// Max log file size before rotation (5MB)
const MAX_LOG_SIZE = 5 * 1024 * 1024;

// Rotate log file if too large
function rotateIfNeeded(): void {
	try {
		const { statSync, renameSync } = require('node:fs');
		if (existsSync(LOG_FILE)) {
			const stats = statSync(LOG_FILE);
			if (stats.size > MAX_LOG_SIZE) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				renameSync(LOG_FILE, `${LOG_FILE}.${timestamp}`);
			}
		}
	} catch {
		// Ignore rotation errors
	}
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
	timestamp: string;
	level: LogLevel;
	component: string;
	event: string;
	message: string;
	data?: Record<string, unknown>;
	error?: string;
	stack?: string;
}

/**
 * Write a log entry to file and console
 */
function writeLog(entry: LogEntry): void {
	const line = JSON.stringify(entry);

	// Console output with color
	const prefix = `[${entry.component}]`;
	const msg = `${entry.event}: ${entry.message}`;

	switch (entry.level) {
		case 'error':
			console.error(prefix, msg, entry.data || '', entry.error || '');
			break;
		case 'warn':
			console.warn(prefix, msg, entry.data || '');
			break;
		case 'debug':
			if (process.env.DEBUG_BROWSER) {
				console.log(prefix, msg, entry.data || '');
			}
			break;
		default:
			console.log(prefix, msg, entry.data || '');
	}

	// File output
	try {
		ensureLogDir();
		rotateIfNeeded();
		appendFileSync(LOG_FILE, `${line}\n`);
	} catch {
		// Ignore file write errors
	}
}

/**
 * Get current memory usage in MB
 */
function getMemoryUsage(): {
	heapUsedMB: number;
	heapTotalMB: number;
	rssMB: number;
	externalMB: number;
} {
	const mem = process.memoryUsage();
	return {
		heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
		heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
		rssMB: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
		externalMB: Math.round((mem.external / 1024 / 1024) * 100) / 100,
	};
}

/**
 * Browser session metrics for observability
 */
interface SessionMetrics {
	startTime: number;
	browserStarts: number;
	browserStops: number;
	crashes: number;
	errors: number;
	navigations: number;
	lastProfile?: string;
	lastUrl?: string;
	peakMemoryMB: number;
}

const sessionMetrics: SessionMetrics = {
	startTime: Date.now(),
	browserStarts: 0,
	browserStops: 0,
	crashes: 0,
	errors: 0,
	navigations: 0,
	peakMemoryMB: 0,
};

/**
 * Browser logger instance
 */
export const browserLogger = {
	/**
	 * Log browser lifecycle events with memory tracking
	 */
	lifecycle(event: string, data?: Record<string, unknown>): void {
		const memory = getMemoryUsage();

		// Track peak memory
		if (memory.rssMB > sessionMetrics.peakMemoryMB) {
			sessionMetrics.peakMemoryMB = memory.rssMB;
		}

		// Track lifecycle events
		if (event === 'started') {
			sessionMetrics.browserStarts++;
			sessionMetrics.lastProfile = data?.profile as string;
		} else if (event === 'stopped') {
			sessionMetrics.browserStops++;
		}

		writeLog({
			timestamp: new Date().toISOString(),
			level: 'info',
			component: 'Browser',
			event,
			message: JSON.stringify(data || {}),
			data: {
				...data,
				memory,
				sessionId: sessionMetrics.browserStarts,
			},
		});
	},

	/**
	 * Log WebSocket connection events
	 */
	connection(event: string, data?: Record<string, unknown>): void {
		writeLog({
			timestamp: new Date().toISOString(),
			level: 'info',
			component: 'BrowserWS',
			event,
			message: JSON.stringify(data || {}),
			data,
		});
	},

	/**
	 * Log profile-related events
	 */
	profile(event: string, profile: string, data?: Record<string, unknown>): void {
		writeLog({
			timestamp: new Date().toISOString(),
			level: 'info',
			component: 'BrowserProfile',
			event,
			message: profile,
			data,
		});
	},

	/**
	 * Log warnings - simpler API (event, data)
	 */
	warn(event: string, data?: Record<string, unknown>): void {
		writeLog({
			timestamp: new Date().toISOString(),
			level: 'warn',
			component: 'Browser',
			event,
			message: JSON.stringify(data || {}),
			data,
		});
	},

	/**
	 * Log errors with stack traces - simpler API (event, error, data)
	 */
	error(event: string, error?: Error | unknown, data?: Record<string, unknown>): void {
		const errorStr = error instanceof Error ? error.message : String(error);
		const stack = error instanceof Error ? error.stack : undefined;
		const memory = getMemoryUsage();

		// Track errors and crashes
		if (event.includes('crash')) {
			sessionMetrics.crashes++;
		} else {
			sessionMetrics.errors++;
		}

		writeLog({
			timestamp: new Date().toISOString(),
			level: 'error',
			component: 'Browser',
			event,
			message: errorStr,
			data: {
				...data,
				memory,
				sessionStats: {
					uptime: Math.round((Date.now() - sessionMetrics.startTime) / 1000),
					browserStarts: sessionMetrics.browserStarts,
					browserStops: sessionMetrics.browserStops,
					crashes: sessionMetrics.crashes,
					errors: sessionMetrics.errors,
					peakMemoryMB: sessionMetrics.peakMemoryMB,
					lastProfile: sessionMetrics.lastProfile,
					lastUrl: sessionMetrics.lastUrl,
				},
			},
			error: errorStr,
			stack,
		});
	},

	/**
	 * Log debug info (only when DEBUG_BROWSER=1) - simple string message
	 */
	debug(message: string, data?: Record<string, unknown>): void {
		writeLog({
			timestamp: new Date().toISOString(),
			level: 'debug',
			component: 'Browser',
			event: 'debug',
			message,
			data,
		});
	},

	/**
	 * Clear the log file (useful for testing)
	 */
	clear(): void {
		try {
			ensureLogDir();
			writeFileSync(LOG_FILE, '');
		} catch {
			// Ignore
		}
	},

	/**
	 * Get the log file path
	 */
	getLogPath(): string {
		return LOG_FILE;
	},

	/**
	 * Track a navigation event
	 */
	trackNavigation(url: string): void {
		sessionMetrics.navigations++;
		sessionMetrics.lastUrl = url;
	},

	/**
	 * Get current session metrics for health endpoints
	 */
	getMetrics(): SessionMetrics & { memory: ReturnType<typeof getMemoryUsage>; uptime: number } {
		return {
			...sessionMetrics,
			memory: getMemoryUsage(),
			uptime: Math.round((Date.now() - sessionMetrics.startTime) / 1000),
		};
	},

	/**
	 * Log periodic health check (call from interval)
	 */
	healthCheck(): void {
		const memory = getMemoryUsage();

		// Warn if memory is getting high (over 500MB RSS)
		const level: LogLevel = memory.rssMB > 500 ? 'warn' : 'info';

		writeLog({
			timestamp: new Date().toISOString(),
			level,
			component: 'BrowserHealth',
			event: 'health_check',
			message: `Memory: ${memory.rssMB}MB RSS, ${memory.heapUsedMB}MB heap`,
			data: {
				memory,
				stats: {
					uptime: Math.round((Date.now() - sessionMetrics.startTime) / 1000),
					browserStarts: sessionMetrics.browserStarts,
					browserStops: sessionMetrics.browserStops,
					crashes: sessionMetrics.crashes,
					errors: sessionMetrics.errors,
					navigations: sessionMetrics.navigations,
					peakMemoryMB: sessionMetrics.peakMemoryMB,
				},
			},
		});
	},
};
