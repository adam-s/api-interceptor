/**
 * Robinhood Interceptor Configuration
 *
 * Domain-specific configuration for Robinhood API interception.
 * Defines URL patterns, required headers, and validation rules.
 *
 * @module browser/robinhood/config
 */

import { z } from 'zod';
import type { InterceptorConfig } from '../shared/config';
import {
	INTERCEPT_PATTERNS,
	RobinhoodHeadersSchema,
	REQUIRED_HEADER_NAMES,
} from './types';

/**
 * Robinhood-specific interceptor configuration.
 */
export const robinhoodInterceptorConfig: InterceptorConfig = {
	domainName: 'robinhood',

	interceptPatterns: [...INTERCEPT_PATTERNS],

	requiredHeaders: [...REQUIRED_HEADER_NAMES],

	headerSchema: RobinhoodHeadersSchema,

	baseUrls: ['https://api.robinhood.com', 'https://bonfire.robinhood.com'],

	loginUrl: 'https://robinhood.com/login',

	accountUrl: 'https://robinhood.com/account',

	accountSelector: '[data-testid="account-number"]',

	// Optional: Custom verification function for Robinhood
	// For now, we rely on the generic header validation
	// Can override this to call a real Robinhood API endpoint if needed
};
