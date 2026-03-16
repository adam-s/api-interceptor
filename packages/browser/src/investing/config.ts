/**
 * Investing.com Interceptor Configuration
 *
 * Financial data platform with earnings calendar, stock data, market analysis.
 * Real authentication required - captures session tokens.
 *
 * @module browser/investing/config
 */

import { z } from 'zod';
import type { InterceptorConfig } from '../shared/config';

/**
 * Investing.com config for API interception.
 */
export const investingInterceptorConfig: InterceptorConfig = {
	domainName: 'investing',

	interceptPatterns: [
		'https://www.investing.com/api/**',
		'https://api.investing.com/**',
		'https://*.investing.com/api/**',
	],

	requiredHeaders: ['Authorization', 'X-Csrf-Token'],
	// Investing requires auth token + CSRF token

	headerSchema: z.object({
		Authorization: z.string().optional(),
		'X-Csrf-Token': z.string().optional(),
		Cookie: z.string().optional(),
	}),

	baseUrls: ['https://www.investing.com', 'https://api.investing.com'],

	loginUrl: 'https://www.investing.com/login/',
	accountUrl: 'https://www.investing.com/account/',
	accountSelector: '[data-testid="account-info"]',
};
