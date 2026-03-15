/**
 * Robinhood browser automation module.
 *
 * Auth interception, session management, API client, and types.
 *
 * @module browser/robinhood
 */

export { RobinhoodApiClient, type VerificationResult } from './api-client';
export { type RobinhoodAuthConfig, RobinhoodAuthService } from './auth';
export {
	type InterceptedRequest,
	type InterceptedResponse,
	type InterceptionCallback,
	RobinhoodInterceptor,
} from './interceptor';
export { RobinhoodSessionManager } from './session-manager';
export {
	type AuthState,
	REQUIRED_HEADER_NAMES,
	type RobinhoodHeaders,
	RobinhoodHeadersSchema,
} from './types';
