import type { InterceptorConfig } from '@interceptor/browser/shared/config';

export const youtubeInterceptorConfig: InterceptorConfig = {
	domainName: 'youtube',
	interceptPatterns: ['https://www.youtube.com/youtubei/**', 'https://suggestqueries-clients6.youtube.com/**'],
	requiredHeaders: [],
	baseUrls: ['https://www.youtube.com'],
};
