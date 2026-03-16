/**
 * Investing.com Domain Plugin
 *
 * Provides API interception and verification for the Investing.com
 * financial data platform.
 *
 * @module domain-investing
 */

import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { investingInterceptorConfig } from './config';
import { InvestingInterceptor } from './interceptor';

export const plugin: DomainPlugin = {
	domainName: 'investing',
	config: investingInterceptorConfig,

	createInterceptor: () => new InvestingInterceptor(),

	verifyCredentials: async (headers) => {
		try {
			const response = await fetch('https://www.investing.com/api/user/profile', { headers });
			if (!response.ok) {
				return { valid: false, error: 'Unauthorized' };
			}
			const data = (await response.json()) as Record<string, unknown>;
			return {
				valid: true,
				accountNumber: data.user_id as string,
				firstName: data.first_name as string,
				lastName: data.last_name as string,
			};
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Verification failed',
			};
		}
	},

	detectLoginPage: (url: string) => url.includes('investing.com/login'),

	onVerified: (result) => ({
		type: 'investing_verified',
		accountNumber: result.accountNumber,
		firstName: result.firstName,
		lastName: result.lastName,
	}),

	onVerificationFailed: (error) => ({
		type: 'investing_verification_failed',
		error,
	}),

	onLoginDetected: () => ({
		type: 'investing_login_page_detected',
	}),
};

export { investingInterceptorConfig } from './config';
export { InvestingInterceptor } from './interceptor';
