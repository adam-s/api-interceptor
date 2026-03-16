/**
 * ustubhub Domain Plugin
 *
 * Provides API interception and proxy routes for stubhub.com.
 *
 * @module domain-stubhub
 */

import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { stubhubInterceptorConfig } from './config';
import { ustubhubInterceptor } from './interceptor';
import { routes } from './routes';

export const plugin: DomainPlugin = {
	domainName: 'stubhub',
	config: stubhubInterceptorConfig,
	routes,

	createInterceptor: () => new ustubhubInterceptor(),

	detectLoginPage: (url: string) => url.includes('stubhub.com/login'),

	onVerified: (result) => ({
		type: 'stubhub_verified',
		accountNumber: result.accountNumber,
	}),

	onVerificationFailed: (error) => ({
		type: 'stubhub_verification_failed',
		error,
	}),

	onLoginDetected: () => ({
		type: 'stubhub_login_page_detected',
	}),
};

export { stubhubInterceptorConfig } from './config';
export { ustubhubInterceptor } from './interceptor';
export { routes } from './routes';
