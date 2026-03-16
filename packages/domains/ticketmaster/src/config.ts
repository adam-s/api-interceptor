/**
 * Ticketmaster Interceptor Configuration
 *
 * Captures API traffic from ticketmaster.com and its subdomains
 * (identity, promoted, analytics, api).
 */

import type { InterceptorConfig } from '@interceptor/browser/shared/config';
import { z } from 'zod';

export const ticketmasterInterceptorConfig: InterceptorConfig = {
	domainName: 'ticketmaster',

	interceptPatterns: [
		'https://www.ticketmaster.com/api/**',
		'https://api.ticketmaster.com/**',
		'https://identity.ticketmaster.com/**',
		'https://promoted.ticketmaster.com/**',
		'https://analytics.ticketmaster.com/**',
	],

	requiredHeaders: [],

	headerSchema: z.object({
		Cookie: z.string().optional(),
	}),

	baseUrls: [
		'https://www.ticketmaster.com',
		'https://api.ticketmaster.com',
		'https://identity.ticketmaster.com',
		'https://promoted.ticketmaster.com',
	],

	loginUrl: 'https://www.ticketmaster.com/member/login',
};
