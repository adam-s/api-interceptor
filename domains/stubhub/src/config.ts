/**
 * ustubhub Interceptor Configuration
 *
 * Captures API traffic from stubhub.com and its subdomains.
 */

import type { InterceptorConfig } from '@interceptor/browser/shared/config';
import { z } from 'zod';

export const stubhubInterceptorConfig: InterceptorConfig = {
	domainName: 'stubhub',

	interceptPatterns: [
		// Add patterns discovered from traffic capture
		// Example: 'https://api.stubhub.com/**'
	],

	requiredHeaders: [],

	headerSchema: z.object({
		Cookie: z.string().optional(),
	}),

	baseUrls: [
		// Add base URLs discovered from traffic capture
		// Example: 'https://www.stubhub.com'
	],
};
