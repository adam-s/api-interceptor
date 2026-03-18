/**
 * Common Types for Interceptor Framework
 *
 * Types used across all domain-specific interceptors.
 *
 * @module browser/shared/types
 */

/**
 * Intercepted HTTP request data.
 */
export interface InterceptedRequest {
	/** Full request URL */
	url: string;
	/** HTTP method (GET, POST, etc.) */
	method: string;
	/** Request headers as key-value pairs */
	headers: Record<string, string>;
	/** Request body (if any) */
	body?: unknown;
	/** Unix timestamp when request was made */
	timestamp: number;
}

/**
 * Intercepted HTTP response data.
 */
export interface InterceptedResponse {
	/** Full response URL (may differ from request URL due to redirects) */
	url: string;
	/** HTTP status code */
	status: number;
	/** Response headers as key-value pairs */
	headers: Record<string, string>;
	/** Response body (parsed as JSON, or fallback to text) */
	body: unknown;
	/** Unix timestamp when response was received */
	timestamp: number;
}

/**
 * Callback function for intercepted request/response pairs.
 * Register via interceptor.onIntercept(callback).
 */
export type InterceptionCallback = (
	request: InterceptedRequest,
	response: InterceptedResponse,
) => void;

/**
 * Session state for status reporting.
 * Discriminated union showing the current authentication state.
 */
export type SessionStatus =
	| { status: 'disconnected'; profileName: string }
	| {
			status: 'connected';
			profileName: string;
			connectedAt: number;
			verified: boolean;
			accountNumber?: string;
			[key: string]: unknown; // Allow domain-specific fields (firstName, lastName, etc)
	  }
	| { status: 'expired'; profileName: string; connectedAt: number }
	| { status: 'error'; message: string };

/**
 * Session data stored on disk.
 * Persists across server restarts.
 */
export interface GenericSession {
	/** Profile name (e.g., 'boardshop-main') */
	profileName: string;
	/** Captured authentication headers */
	headers?: Record<string, string>;
	/** When the session was established */
	connectedAt?: number;
	/** When the bearer token was last refreshed */
	lastTokenRefresh?: number;
	/** Account number or identifier (if available) */
	accountNumber?: string;
	/** Whether credentials have been verified with a real API call */
	verified: boolean;
	/** Last verification error (if any) */
	verificationError?: string;
	/** Additional domain-specific fields */
	[key: string]: unknown;
}

/**
 * Event types emitted by the session manager.
 */
export type SessionEventType =
	| 'connected'
	| 'verified'
	| 'verification_failed'
	| 'disconnected'
	| 'expired'
	| 'restored';

/**
 * Event payload for session status changes.
 * Emitted via EventEmitter for subscribers (e.g., SSE connections).
 */
export interface SessionEvent {
	type: SessionEventType;
	profileName: string;
	status: SessionStatus;
}
