/**
 * ustubhub Interceptor
 *
 * Extends GenericInterceptor for stubhub.com API traffic capture.
 */

import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { stubhubInterceptorConfig } from './config';

export class ustubhubInterceptor extends GenericInterceptor {
	constructor() {
		super(stubhubInterceptorConfig);
	}
}
