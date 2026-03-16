/**
 * MinuteInbox Interceptor Configuration
 *
 * Temporary email service for capturing registration emails.
 * Used in Phase 4 to get email for Investing.com account creation.
 *
 * @module browser/minuteinbox/config
 */

import type { InterceptorConfig } from '@interceptor/browser/shared/config';
import { z } from 'zod';

/**
 * MinuteInbox config for API interception.
 */
export const minuteinboxInterceptorConfig: InterceptorConfig = {
	domainName: 'minuteinbox',

	interceptPatterns: ['https://www.minuteinbox.com/api/**', 'https://api.minuteinbox.com/**'],

	requiredHeaders: [],
	// MinuteInbox doesn't require auth for basic email generation

	headerSchema: z.object({
		Cookie: z.string().optional(),
	}),

	baseUrls: ['https://www.minuteinbox.com', 'https://api.minuteinbox.com'],

	loginUrl: 'https://www.minuteinbox.com/',
};
