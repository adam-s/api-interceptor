/**
 * Domain Configuration Registry
 *
 * Maps domain names (profiles) to their interceptor configs and domain-specific
 * handlers. This is the single source of truth for multi-domain support.
 *
 * To add support for a new domain (e.g., LinkedIn):
 * 1. Create LinkedInInterceptor extending GenericInterceptor
 * 2. Define linkedinConfig: InterceptorConfig
 * 3. Add to DOMAIN_CONFIGS below with callbacks
 *
 * @module browser/domain-config
 */

import type { VerificationResult } from './shared/config';
import { GenericInterceptor } from './shared/interceptor';
import { robinhoodInterceptorConfig } from './robinhood/config';
import { RobinhoodInterceptor } from './robinhood/interceptor';
import { RobinhoodApiClient } from './robinhood/api-client';

/**
 * WebSocket message sent when verification succeeds.
 */
export interface VerificationSuccessMessage {
	type: string;
	accountNumber?: string;
	firstName?: string;
	lastName?: string;
	buyingPower?: string;
	[key: string]: unknown;
}

/**
 * WebSocket message sent when verification fails.
 */
export interface VerificationFailureMessage {
	type: string;
	error: string;
}

/**
 * WebSocket message sent when login page is detected.
 */
export interface LoginDetectedMessage {
	type: string;
	[key: string]: unknown;
}

/**
 * Configuration for a domain with callbacks for handling intercepted headers and events.
 */
export interface DomainConfig {
	/**
	 * Interceptor config (inherited from base config).
	 * Defines URL patterns, required headers, validation schema, etc.
	 */
	domainName: string;
	interceptPatterns: string[];
	requiredHeaders: string[];
	headerSchema: any; // ZodSchema type
	baseUrls?: string[];
	loginUrl?: string;
	accountUrl?: string;

	/**
	 * Factory function to create an interceptor instance for this domain.
	 */
	createInterceptor: () => GenericInterceptor;

	/**
	 * Optional: Verify captured credentials with real API call.
	 * Return true if valid, false if invalid.
	 */
	verifyCredentials?: (headers: Record<string, string>) => Promise<VerificationResult>;

	/**
	 * Optional: Detect login page for domain-specific login detection.
	 * Return true if on login page.
	 */
	detectLoginPage?: (url: string) => boolean;

	/**
	 * Optional: Generate WebSocket message when verification succeeds.
	 */
	onVerified?: (result: VerificationResult) => VerificationSuccessMessage;

	/**
	 * Optional: Generate WebSocket message when verification fails.
	 */
	onVerificationFailed?: (error: string) => VerificationFailureMessage;

	/**
	 * Optional: Generate WebSocket message when login page detected.
	 */
	onLoginDetected?: () => LoginDetectedMessage;
}

/**
 * Global registry of domain configurations.
 *
 * Maps profile name (e.g., 'robinhood-trading') to full domain config
 * including interceptor factory and verification callbacks.
 */
export const DOMAIN_CONFIGS: Record<string, DomainConfig> = {
	/**
	 * Robinhood trading domain configuration.
	 */
	robinhood: {
		...robinhoodInterceptorConfig,

		createInterceptor: () => new RobinhoodInterceptor(),

		/**
		 * Verify Robinhood credentials via real API call.
		 */
		verifyCredentials: async (headers) => {
			try {
				const client = new RobinhoodApiClient(headers as any);
				const result = await client.verify();
				return result;
			} catch (error) {
				return {
					valid: false,
					error: error instanceof Error ? error.message : 'Verification failed',
				};
			}
		},

		/**
		 * Detect Robinhood login page.
		 */
		detectLoginPage: (url: string) => url.includes('robinhood.com/login'),

		/**
		 * WebSocket message for successful verification.
		 */
		onVerified: (result) => ({
			type: 'robinhood_verified',
			accountNumber: result.accountNumber,
			firstName: (result as any).firstName,
			lastName: (result as any).lastName,
			buyingPower: (result as any).buyingPower,
		}),

		/**
		 * WebSocket message for failed verification.
		 */
		onVerificationFailed: (error) => ({
			type: 'robinhood_verification_failed',
			error,
		}),

		/**
		 * WebSocket message when login page detected.
		 */
		onLoginDetected: () => ({
			type: 'robinhood_login_page_detected',
		}),
	},

	// LinkedIn configuration can be added here
	// linkedin: {
	//   ...linkedinInterceptorConfig,
	//   createInterceptor: () => new LinkedInInterceptor(),
	//   // ... callbacks
	// },
};

/**
 * Get the domain config for a profile name.
 *
 * Returns undefined if the profile is not in the registry.
 * Unknown profiles can still be used for generic traffic capture.
 */
export function getDomainConfig(profileName: string): DomainConfig | undefined {
	return DOMAIN_CONFIGS[profileName];
}
