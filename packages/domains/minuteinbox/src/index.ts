/**
 * MinuteInbox Domain Plugin
 *
 * Provides API interception for the MinuteInbox temporary email service.
 * No authentication required — used for generating disposable email addresses.
 *
 * @module domain-minuteinbox
 */

import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { minuteinboxInterceptorConfig } from './config';
import { MinuteInboxInterceptor } from './interceptor';

export const plugin: DomainPlugin = {
	domainName: 'minuteinbox',
	config: minuteinboxInterceptorConfig,

	createInterceptor: () => new MinuteInboxInterceptor(),

	// MinuteInbox doesn't require authentication
	verifyCredentials: async () => ({
		valid: true,
		accountNumber: 'minuteinbox-temp',
	}),

	detectLoginPage: (url: string) =>
		url.includes('minuteinbox.com/login') || url.includes('minuteinbox.com/signin'),

	onVerified: (result) => ({
		type: 'minuteinbox_verified',
		accountNumber: result.accountNumber,
	}),

	onVerificationFailed: (error) => ({
		type: 'minuteinbox_verification_failed',
		error,
	}),

	onLoginDetected: () => ({
		type: 'minuteinbox_login_page_detected',
	}),
};

export { minuteinboxInterceptorConfig } from './config';
export { MinuteInboxInterceptor } from './interceptor';
