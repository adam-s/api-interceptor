/**
 * Robinhood Domain Plugin
 *
 * Provides API interception, authentication, and verification
 * for the Robinhood trading platform.
 *
 * @module domain-robinhood
 */

import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { RobinhoodApiClient } from './api-client';
import { robinhoodInterceptorConfig } from './config';
import { RobinhoodInterceptor } from './interceptor';

export const plugin: DomainPlugin = {
	domainName: 'robinhood',
	config: robinhoodInterceptorConfig,

	createInterceptor: () => new RobinhoodInterceptor(),

	verifyCredentials: async (headers) => {
		try {
			const client = new RobinhoodApiClient(headers as any);
			return await client.verify();
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Verification failed',
			};
		}
	},

	detectLoginPage: (url: string) => url.includes('robinhood.com/login'),

	onVerified: (result) => ({
		type: 'robinhood_verified',
		accountNumber: result.accountNumber,
		firstName: result.firstName,
		lastName: result.lastName,
		buyingPower: result.buyingPower,
	}),

	onVerificationFailed: (error) => ({
		type: 'robinhood_verification_failed',
		error,
	}),

	onLoginDetected: () => ({
		type: 'robinhood_login_page_detected',
	}),
};

// Re-export components for direct use
export { RobinhoodApiClient } from './api-client';
export { RobinhoodAuthService } from './auth';
export { robinhoodInterceptorConfig } from './config';
export { RobinhoodInterceptor } from './interceptor';
export { RobinhoodSessionManager } from './session-manager';
export type { RobinhoodHeaders } from './types';
