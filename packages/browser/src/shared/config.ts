/**
 * Interceptor Configuration
 *
 * Defines the contract that domain-specific interceptors must implement.
 * A domain is any website whose API you want to capture.
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
	 * Human-readable domain name (e.g., 'boardshop', 'deckmarket').
	 * Used for logging, session file naming, and plugin identification.
	 */
	domainName: string;

	/**
	 * URL patterns to intercept (glob-style).
	 * Example: ['https://api.boardshop.com/**', 'https://cdn.boardshop.com/**']
	 *
	 * Patchright route interception will capture traffic matching these patterns.
	 */
	interceptPatterns: string[];

	/**
	 * Required header names that indicate successful authentication.
	 * Example: ['Authorization', 'X-Api-Key', 'X-Client-Version']
	 *
	 * The interceptor waits until all required headers are captured,
	 * then validates them against headerSchema.
	 */
	requiredHeaders: string[];

	/**
	 * Zod schema to validate captured headers.
	 * Called via .safeParse() to ensure captured headers are valid.
	 * Optional — defaults to z.object({}) if requiredHeaders is empty.
	 *
	 * Example:
	 * ```typescript
	 * headerSchema: z.object({
	 *   Authorization: z.string().startsWith('Bearer '),
	 *   'X-Api-Key': z.string(),
	 *   'X-Client-Version': z.string(),
	 * })
	 * ```
	 */
	headerSchema?: z.ZodSchema;

	/**
	 * Optional: Base URLs for the domain (for API calls).
	 * Can be derived from captured traffic or hardcoded.
	 * Example: ['https://api.boardshop.com', 'https://cdn.boardshop.com']
	 */
	baseUrls?: string[];

	/**
	 * Optional: Login page URL.
	 * Used by GenericAuthService to navigate to login.
	 * Example: 'https://boardshop.com/login'
	 */
	loginUrl?: string;

	/**
	 * Optional: Account/dashboard page URL.
	 * Used by GenericAuthService to check if user is logged in.
	 * Example: 'https://boardshop.com/account'
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
	 *   const res = await fetch('https://api.boardshop.com/accounts/', { headers });
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
