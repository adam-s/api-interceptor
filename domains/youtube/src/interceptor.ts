import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { youtubeInterceptorConfig } from './config.js';

export class YouTubeInterceptor extends GenericInterceptor {
	constructor() {
		super(youtubeInterceptorConfig);
	}
}
