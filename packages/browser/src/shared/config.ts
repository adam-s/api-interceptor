/**
 * Interceptor Configuration
 *
 * Defines the contract that domain-specific interceptors must implement.
 * A domain is any website whose API you want to capture (Robinhood, LinkedIn, etc).
 *
 * @module browser/shared/config
 */

import type { z } from 'zod';

/**
 * Configuration for a domain-specific interceptor.
 *
 * Use this to define how to intercept, authenticate, and interact with a website.
 */
export interface InterceptorConfig {
	/**
	 * Human-readable domain name (e.g., 'robinhood', 'linkedin', 'twitter').
	 * Used for logging, session file naming, and plugin identification.
	 */
	domainName: string;

	/**
	 * URL patterns to intercept (glob-style).
	 * Example: ['https://api.robinhood.com/**', 'https://bonfire.robinhood.com/**']
	 *
	 * Patchright route interception will capture traffic matching these patterns.
	 */
	interceptPatterns: string[];

	/**
	 * Required header names that indicate successful authentication.
	 * Example: ['Authorization', 'X-Hyper-Ex', 'X-Robinhood-API-Version']
	 *
	 * The interceptor waits until all required headers are captured,
	 * then validates them against headerSchema.
	 */
	requiredHeaders: string[];

	/**
	 * Zod schema to validate captured headers.
	 * Called via .safeParse() to ensure captured headers are valid.
	 *
	 * Example:
	 * ```typescript
	 * headerSchema: z.object({
	 *   Authorization: z.string().startsWith('Bearer '),
	 *   'X-Hyper-Ex': z.string(),
	 *   'X-Robinhood-API-Version': z.string(),
	 * })
	 * ```
	 */
	headerSchema: z.ZodSchema;

	/**
	 * Optional: Base URLs for the domain (for API calls).
	 * Can be derived from captured traffic or hardcoded.
	 * Example: ['https://api.robinhood.com', 'https://bonfire.robinhood.com']
	 */
	baseUrls?: string[];

	/**
	 * Optional: Login page URL.
	 * Used by GenericAuthService to navigate to login.
	 * Example: 'https://robinhood.com/login'
	 */
	loginUrl?: string;

	/**
	 * Optional: Account/dashboard page URL.
	 * Used by GenericAuthService to check if user is logged in.
	 * Example: 'https://robinhood.com/account'
	 */
	accountUrl?: string;

	/**
	 * Optional: CSS selector to extract account identifier from page.
	 * Used by GenericAuthService.extractAccountNumber().
	 * Example: '[data-testid="account-number"]'
	 */
	accountSelector?: string;

	/**
	 * Optional: Custom verification function.
	 * If provided, called instead of making a generic API call to verify headers.
	 * Useful for domains with specific verification requirements.
	 *
	 * Example:
	 * ```typescript
	 * verifyFn: async (headers) => {
	 *   const res = await fetch('https://api.robinhood.com/accounts/', { headers });
	 *   if (!res.ok) return { valid: false, error: 'API returned ' + res.status };
	 *   const data = await res.json();
	 *   return { valid: true, accountNumber: data.results[0].account_number };
	 * }
	 * ```
	 */
	verifyFn?: (
		headers: Record<string, string>,
	) => Promise<{ valid: boolean; accountNumber?: string; error?: string }>;
}

/**
 * Verification result from attempting to validate captured headers.
 */
export interface VerificationResult {
	valid: boolean;
	accountNumber?: string;
	error?: string;
	[key: string]: unknown; // Allow domain-specific fields (firstName, lastName, etc)
}
