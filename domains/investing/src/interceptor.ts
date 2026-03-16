/**
 * Investing.com Interceptor
 *
 * Extends GenericInterceptor for Investing.com API.
 * Captures authenticated financial data API calls.
 *
 * @module browser/investing/interceptor
 */

import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { investingInterceptorConfig } from './config';

/**
 * Investing.com API interceptor.
 *
 * Captures financial data API traffic.
 * Requires authentication headers.
 */
export class InvestingInterceptor extends GenericInterceptor {
	constructor() {
		super(investingInterceptorConfig);
	}
}
