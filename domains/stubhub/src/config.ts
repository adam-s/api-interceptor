import type { InterceptorConfig } from '@interceptor/browser/shared/config';
import { z } from 'zod';

export const stubhubInterceptorConfig: InterceptorConfig = {
	domainName: 'stubhub',
	interceptPatterns: ['https://www.stubhub.com/**'],
	requiredHeaders: [],
	headerSchema: z.object({ Cookie: z.string().optional() }),
	baseUrls: ['https://www.stubhub.com'],
	loginUrl: 'https://www.stubhub.com/login',
};
