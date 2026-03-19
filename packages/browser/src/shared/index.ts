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

export type { InterceptorConfig, VerificationResult } from './config';
export { GenericInterceptor } from './interceptor';
export { GenericSessionManager } from './session-manager';
export type {
	InterceptedRequest,
	InterceptedResponse,
	InterceptionCallback,
	SessionStatus,
} from './types';
export {
	classifyEntry,
	classifyPage,
	type TransportType,
	type EncodingType,
	type TrafficClassification,
	type TrafficEntry,
	type PageClassification,
} from './classify-transport';
