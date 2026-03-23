import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { youtubeInterceptorConfig } from './config.js';
import { YouTubeInterceptor } from './interceptor.js';
import { routes } from './routes.js';

export const plugin: DomainPlugin = {
	domainName: 'youtube',
	config: youtubeInterceptorConfig,
	createInterceptor: () => new YouTubeInterceptor(),
	routes,
};
