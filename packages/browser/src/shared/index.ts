/**
 * @interceptor/browser/shared — Generic domain-agnostic classes
 *
 * Shared base classes for multi-domain support:
 * - GenericInterceptor: Base class for all domain interceptors
 * - GenericSessionManager: Centralized session/header management
 * - Shared types and configs
 *
 * @module browser/shared
 */

export { GenericInterceptor } from './interceptor';
export type { InterceptorConfig } from './config';
export { GenericSessionManager } from './session-manager';
export type { VerificationResult } from './config';
export type { InterceptedRequest, InterceptedResponse, InterceptionCallback, SessionStatus } from './types';
