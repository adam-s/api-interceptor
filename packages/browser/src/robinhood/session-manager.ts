/**
 * Robinhood Session Manager
 *
 * Server-side singleton that manages Robinhood authentication sessions.
 * Stores captured headers per browser profile and tracks session validity.
 * Broadcasts status changes via EventEmitter for SSE subscribers.
 *
 * IMPORTANT: Sessions are persisted to disk so they survive server restarts.
 * Session files are stored in the browser profile directory as 'robinhood-session.json'.
 *
 * @module browser/robinhood/session-manager
 */

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getProfilePath } from '../remote/profiles';
import type { RobinhoodHeaders } from './types';

/** Session data for a Robinhood connection */
export interface RobinhoodSession {
	/** Browser profile name */
	profileName: string;
	/** Captured authentication headers */
	headers?: RobinhoodHeaders;
	/** When the session was established */
	connectedAt?: number;
	/** When the Bearer token was last refreshed */
	lastTokenRefresh?: number;
	/** Account number (from verification) */
	accountNumber?: string;
	/** Account holder's first name (from verification) */
	firstName?: string;
	/** Account holder's last name (from verification) */
	lastName?: string;
	/** Current buying power (from verification) */
	buyingPower?: string;
	/** Whether credentials have been verified with a real API call */
	verified: boolean;
	/** Last verification error if any */
	verificationError?: string;
}

/** Session state for status reporting */
export type SessionStatus =
	| { status: 'disconnected'; profileName: string }
	| {
			status: 'connected';
			profileName: string;
			connectedAt: number;
			verified: boolean;
			accountNumber?: string;
			firstName?: string;
			lastName?: string;
			buyingPower?: string;
			verificationError?: string;
			/** When the Bearer token was last refreshed */
			lastTokenRefresh?: number;
			/** Whether the token needs refreshing (older than 20 hours) */
			needsTokenRefresh?: boolean;
	  }
	| { status: 'expired'; profileName: string; connectedAt: number };

/** Event types emitted by the session manager */
export type SessionEventType =
	| 'connected'
	| 'verified'
	| 'verification_failed'
	| 'disconnected'
	| 'expired'
	| 'restored';

/** Event payload for session status changes */
export interface SessionEvent {
	type: SessionEventType;
	profileName: string;
	status: SessionStatus;
}

/**
 * Default max age for sessions (30 days - browser cookies last this long).
 * The browser profile maintains login cookies that persist for ~30 days.
 * Bearer tokens expire after ~24 hours but are refreshed automatically
 * when the browser navigates to Robinhood.
 */
const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Bearer token refresh threshold (20 hours).
 * Tokens should be refreshed before they expire (~24 hours).
 * When a session's token is older than this, needsTokenRefresh() returns true.
 */
export const TOKEN_REFRESH_THRESHOLD_MS = 20 * 60 * 60 * 1000;

/** Session file name within profile directory */
const SESSION_FILE = 'robinhood-session.json';

/**
 * Singleton manager for Robinhood authentication sessions.
 *
 * Sessions are automatically persisted to disk and restored on startup.
 *
 * Usage:
 * ```typescript
 * const manager = RobinhoodSessionManager.getInstance();
 *
 * // When headers are captured from interceptor
 * manager.setHeaders('robinhood-trading', capturedHeaders);
 *
 * // Check if we have valid auth
 * if (manager.hasValidSession('robinhood-trading')) {
 *   const headers = manager.getHeaders('robinhood-trading');
 *   // Use headers for API calls
 * }
 *
 * // Subscribe to status changes (for SSE)
 * manager.on('status', (event) => {
 *   console.log(`Profile ${event.profileName} is now ${event.type}`);
 * });
 * ```
 */
export class RobinhoodSessionManager extends EventEmitter {
	private static instance: RobinhoodSessionManager;
	private sessions: Map<string, RobinhoodSession> = new Map();
	private maxAgeMs: number;

	private constructor(maxAgeMs = DEFAULT_MAX_AGE_MS) {
		super();
		// Allow more listeners for SSE connections from multiple browser tabs
		this.setMaxListeners(50);
		this.maxAgeMs = maxAgeMs;
		// Load any persisted sessions on startup
		this.loadPersistedSessions();
	}

	/**
	 * Get the singleton instance.
	 */
	static getInstance(): RobinhoodSessionManager {
		if (!RobinhoodSessionManager.instance) {
			RobinhoodSessionManager.instance = new RobinhoodSessionManager();
		}
		return RobinhoodSessionManager.instance;
	}

	/**
	 * Reset the singleton (for testing).
	 */
	static resetInstance(): void {
		RobinhoodSessionManager.instance = new RobinhoodSessionManager();
	}

	/**
	 * Load persisted sessions from disk.
	 * Called on singleton initialization.
	 */
	private loadPersistedSessions(): void {
		// Try to load robinhood-trading profile session
		const profileName = 'robinhood-trading';
		const session = this.loadSessionFromDisk(profileName);
		if (session) {
			// Validate session is not expired
			if (this.isSessionValid(session)) {
				this.sessions.set(profileName, session);
				console.log(
					`[SessionManager] ✅ Restored session for ${profileName} from disk (account: ${session.accountNumber}, verified: ${session.verified})`,
				);
				this.emitStatusChange('restored', profileName);
			} else {
				console.log(
					`[SessionManager] Found persisted session for ${profileName} but it has expired`,
				);
			}
		} else {
			console.log(`[SessionManager] No persisted session found for ${profileName}`);
		}
	}

	/**
	 * Load a session from the profile's session file.
	 */
	private loadSessionFromDisk(profileName: string): RobinhoodSession | null {
		try {
			const profilePath = getProfilePath(profileName);
			if (!profilePath) return null;

			const sessionFile = join(profilePath, SESSION_FILE);
			if (!existsSync(sessionFile)) return null;

			const data = readFileSync(sessionFile, 'utf-8');
			const session = JSON.parse(data) as RobinhoodSession;

			// Validate required fields
			if (!session.headers || !session.connectedAt) {
				console.log(`[SessionManager] Invalid session file for ${profileName}`);
				return null;
			}

			return session;
		} catch (err) {
			console.log(`[SessionManager] Failed to load session for ${profileName}:`, err);
			return null;
		}
	}

	/**
	 * Persist a session to disk.
	 */
	private saveSessionToDisk(profileName: string, session: RobinhoodSession): void {
		try {
			const profilePath = getProfilePath(profileName);
			if (!profilePath) {
				console.log(
					`[SessionManager] Cannot save session - profile path not found: ${profileName}`,
				);
				return;
			}

			// Ensure directory exists
			if (!existsSync(profilePath)) {
				mkdirSync(profilePath, { recursive: true });
			}

			const sessionFile = join(profilePath, SESSION_FILE);
			writeFileSync(sessionFile, JSON.stringify(session, null, 2));
			console.log(`[SessionManager] Persisted session to disk`);
		} catch (err) {
			console.error(`[SessionManager] Failed to save session for ${profileName}:`, err);
		}
	}

	/**
	 * Delete persisted session from disk.
	 */
	private deleteSessionFromDisk(profileName: string): void {
		try {
			const profilePath = getProfilePath(profileName);
			if (!profilePath) return;

			const sessionFile = join(profilePath, SESSION_FILE);
			if (existsSync(sessionFile)) {
				unlinkSync(sessionFile);
				console.log(`[SessionManager] Deleted session file from disk`);
			}
		} catch (err) {
			console.error(`[SessionManager] Failed to delete session for ${profileName}:`, err);
		}
	}

	/**
	 * Emit a status change event for SSE subscribers.
	 */
	private emitStatusChange(type: SessionEventType, profileName: string): void {
		const event: SessionEvent = {
			type,
			profileName,
			status: this.getStatus(profileName),
		};
		this.emit('status', event);
	}

	/**
	 * Update session with captured headers.
	 * Note: This sets verified=false - call verifySession() to validate.
	 */
	setHeaders(profileName: string, headers: RobinhoodHeaders, accountNumber?: string): void {
		const existing = this.sessions.get(profileName);
		const now = Date.now();
		const session: RobinhoodSession = {
			profileName,
			headers,
			// Keep original connectedAt if refreshing an existing session
			connectedAt: existing?.connectedAt || now,
			lastTokenRefresh: now,
			accountNumber: accountNumber || existing?.accountNumber,
			firstName: existing?.firstName,
			lastName: existing?.lastName,
			buyingPower: existing?.buyingPower,
			// Keep verified status if refreshing (same account)
			verified: !!(existing?.verified && existing?.accountNumber === accountNumber),
		};
		this.sessions.set(profileName, session);
		this.saveSessionToDisk(profileName, session);
		const isRefresh = existing?.connectedAt ? ' (token refresh)' : ' (new session)';
		console.log(`[SessionManager] Headers captured for ${profileName}${isRefresh}`);
		this.emitStatusChange('connected', profileName);
	}

	/**
	 * Mark session as verified with account details.
	 */
	markVerified(
		profileName: string,
		details: {
			accountNumber: string;
			firstName?: string;
			lastName?: string;
			buyingPower?: string;
		},
	): void {
		const existing = this.sessions.get(profileName);
		if (existing) {
			existing.verified = true;
			existing.accountNumber = details.accountNumber;
			existing.firstName = details.firstName;
			existing.lastName = details.lastName;
			existing.buyingPower = details.buyingPower;
			existing.verificationError = undefined;
			this.sessions.set(profileName, existing);
			this.saveSessionToDisk(profileName, existing);
			console.log(
				`[SessionManager] ✅ VERIFIED ${profileName}: ${details.firstName} ${details.lastName} (${details.accountNumber})`,
			);
			this.emitStatusChange('verified', profileName);
		}
	}

	/**
	 * Mark session verification as failed.
	 */
	markVerificationFailed(profileName: string, error: string): void {
		const existing = this.sessions.get(profileName);
		if (existing) {
			existing.verified = false;
			existing.verificationError = error;
			this.sessions.set(profileName, existing);
			this.saveSessionToDisk(profileName, existing);
			console.log(`[SessionManager] ❌ Verification failed for ${profileName}: ${error}`);
			this.emitStatusChange('verification_failed', profileName);
		}
	}

	/**
	 * Update account number for a session.
	 */
	setAccountNumber(profileName: string, accountNumber: string): void {
		const existing = this.sessions.get(profileName);
		if (existing) {
			existing.accountNumber = accountNumber;
			this.sessions.set(profileName, existing);
			this.saveSessionToDisk(profileName, existing);
		}
	}

	/**
	 * Get headers for a profile (if valid).
	 */
	getHeaders(profileName: string): RobinhoodHeaders | null {
		const session = this.sessions.get(profileName);
		if (!session?.headers) {
			return null;
		}
		if (!this.isSessionValid(session)) {
			return null;
		}
		return session.headers;
	}

	/**
	 * Get current session state for a profile.
	 */
	getSession(profileName: string): RobinhoodSession | null {
		return this.sessions.get(profileName) || null;
	}

	/**
	 * Get session status for API response.
	 */
	getStatus(profileName: string): SessionStatus {
		const session = this.sessions.get(profileName);

		if (!session?.headers) {
			return { status: 'disconnected', profileName };
		}

		if (!this.isSessionValid(session)) {
			return {
				status: 'expired',
				profileName,
				connectedAt: session.connectedAt ?? Date.now(),
			};
		}

		return {
			status: 'connected',
			profileName,
			connectedAt: session.connectedAt ?? Date.now(),
			verified: session.verified,
			accountNumber: session.accountNumber,
			firstName: session.firstName,
			lastName: session.lastName,
			buyingPower: session.buyingPower,
			verificationError: session.verificationError,
			lastTokenRefresh: session.lastTokenRefresh,
			needsTokenRefresh: this.needsTokenRefresh(profileName),
		};
	}

	/**
	 * Check if a profile has valid (non-expired) headers.
	 */
	hasValidSession(profileName: string): boolean {
		const session = this.sessions.get(profileName);
		if (!session?.headers) return false;
		return this.isSessionValid(session);
	}

	/**
	 * Clear session for a profile.
	 * @param profileName - The profile to clear
	 * @param options.force - If true, clear even if session is verified. Required for verified sessions.
	 * @returns true if session was cleared, false if blocked
	 */
	clearSession(profileName: string, options?: { force?: boolean }): boolean {
		const session = this.sessions.get(profileName);

		// Protect verified sessions from accidental clearing
		if (session?.verified && !options?.force) {
			console.log(
				`[SessionManager] BLOCKED: Cannot clear verified session for ${profileName} without force=true`,
			);
			return false;
		}

		this.sessions.delete(profileName);
		this.deleteSessionFromDisk(profileName);
		console.log(
			`[SessionManager] Session cleared for ${profileName} (force=${options?.force ?? false})`,
		);
		this.emitStatusChange('disconnected', profileName);
		return true;
	}

	/**
	 * List all active profiles with sessions.
	 */
	listSessions(): string[] {
		return Array.from(this.sessions.keys());
	}

	/**
	 * Check if session is still valid (not expired).
	 */
	private isSessionValid(session: RobinhoodSession): boolean {
		if (!session.connectedAt) return false;
		return Date.now() - session.connectedAt < this.maxAgeMs;
	}

	/**
	 * Check if the Bearer token needs refreshing.
	 * Tokens expire after ~24 hours, so we refresh at 20 hours.
	 * The browser profile cookies keep us logged in for 30 days,
	 * but we need fresh Bearer tokens for API calls.
	 */
	needsTokenRefresh(profileName: string): boolean {
		const session = this.sessions.get(profileName);
		if (!session?.headers) return false;

		// Use lastTokenRefresh if available, otherwise fall back to connectedAt
		const tokenTime = session.lastTokenRefresh || session.connectedAt;
		if (!tokenTime) return true;

		const tokenAge = Date.now() - tokenTime;
		return tokenAge > TOKEN_REFRESH_THRESHOLD_MS;
	}

	/**
	 * Get the age of the current Bearer token in milliseconds.
	 */
	getTokenAge(profileName: string): number | null {
		const session = this.sessions.get(profileName);
		if (!session?.headers) return null;

		const tokenTime = session.lastTokenRefresh || session.connectedAt;
		if (!tokenTime) return null;

		return Date.now() - tokenTime;
	}

	/**
	 * Update session with refreshed headers (new Bearer token).
	 * Called after navigating the browser to Robinhood and capturing new headers.
	 * This resets the token refresh timer without changing connectedAt.
	 */
	refreshToken(profileName: string, headers: RobinhoodHeaders): void {
		const existing = this.sessions.get(profileName);
		if (!existing) {
			console.log(`[SessionManager] Cannot refresh token - no session for ${profileName}`);
			return;
		}

		// Update headers and token refresh time, keep original connectedAt
		existing.headers = headers;
		existing.lastTokenRefresh = Date.now();
		this.sessions.set(profileName, existing);
		this.saveSessionToDisk(profileName, existing);

		const sessionAge = existing.connectedAt ? Date.now() - existing.connectedAt : 0;
		const sessionDays = Math.floor(sessionAge / (24 * 60 * 60 * 1000));
		console.log(
			`[SessionManager] ✅ Token refreshed for ${profileName} (session age: ${sessionDays} days)`,
		);
	}
}
