/**
 * Ticketmaster Interceptor
 *
 * Extends GenericInterceptor for Ticketmaster API traffic capture.
 */

import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { ticketmasterInterceptorConfig } from './config';

export class TicketmasterInterceptor extends GenericInterceptor {
	constructor() {
		super(ticketmasterInterceptorConfig);
	}
}
