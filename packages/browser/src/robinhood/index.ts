/**
 * Robinhood browser automation module.
 *
 * Auth interception, session management, API client, and types.
 *
 * @module browser/robinhood
 */

export { RobinhoodApiClient, type VerificationResult } from './api-client';
export { RobinhoodAuthService, type RobinhoodAuthConfig } from './auth';
export {
	RobinhoodInterceptor,
	type InterceptedRequest,
	type InterceptedResponse,
	type InterceptionCallback,
} from './interceptor';
export { RobinhoodSessionManager } from './session-manager';
export {
	type AuthState,
	type RobinhoodHeaders,
	RobinhoodHeadersSchema,
	REQUIRED_HEADER_NAMES,
} from './types';
