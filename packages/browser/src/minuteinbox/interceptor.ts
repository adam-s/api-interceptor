/**
 * MinuteInbox Interceptor
 *
 * Extends GenericInterceptor for MinuteInbox API.
 * Captures email generation and inbox API calls.
 *
 * @module browser/minuteinbox/interceptor
 */

import { GenericInterceptor } from '../shared/interceptor';
import { minuteinboxInterceptorConfig } from './config';

/**
 * MinuteInbox API interceptor.
 *
 * Captures temporary email API traffic.
 */
export class MinuteInboxInterceptor extends GenericInterceptor {
	constructor() {
		super(minuteinboxInterceptorConfig);
	}
}
