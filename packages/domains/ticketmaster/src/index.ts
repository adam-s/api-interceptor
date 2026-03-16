/**
 * Ticketmaster Domain Plugin
 *
 * Provides API interception and proxy routes for Ticketmaster.
 * Routes were discovered by capturing real browser traffic.
 *
 * Usage:
 *   1. Connect browser: /browser?profile=ticketmaster&capture=ticketmaster.com
 *   2. Navigate to ticketmaster.com
 *   3. API routes available at: /api/ticketmaster/trending/searches, etc.
 *
 * @module domain-ticketmaster
 */

import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { ticketmasterInterceptorConfig } from './config';
import { TicketmasterInterceptor } from './interceptor';
import { routes } from './routes';

export const plugin: DomainPlugin = {
	domainName: 'ticketmaster',
	config: ticketmasterInterceptorConfig,
	routes,

	createInterceptor: () => new TicketmasterInterceptor(),

	detectLoginPage: (url: string) => url.includes('ticketmaster.com/member/login'),

	onVerified: (result) => ({
		type: 'ticketmaster_verified',
		accountNumber: result.accountNumber,
	}),

	onVerificationFailed: (error) => ({
		type: 'ticketmaster_verification_failed',
		error,
	}),

	onLoginDetected: () => ({
		type: 'ticketmaster_login_page_detected',
	}),
};

export { ticketmasterInterceptorConfig } from './config';
export { TicketmasterInterceptor } from './interceptor';
export { routes } from './routes';
