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

import { investingInterceptorConfig } from './investing/config';
import { InvestingInterceptor } from './investing/interceptor';
import { minuteinboxInterceptorConfig } from './minuteinbox/config';
import { MinuteInboxInterceptor } from './minuteinbox/interceptor';
import { RobinhoodApiClient } from './robinhood/api-client';
import { robinhoodInterceptorConfig } from './robinhood/config';
import { RobinhoodInterceptor } from './robinhood/interceptor';
import type { VerificationResult } from './shared/config';
import type { GenericInterceptor } from './shared/interceptor';

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

	/**
	 * MinuteInbox temporary email service configuration.
	 */
	minuteinbox: {
		...minuteinboxInterceptorConfig,

		createInterceptor: () => new MinuteInboxInterceptor(),

		/**
		 * No verification needed - MinuteInbox doesn't require authentication.
		 */
		verifyCredentials: async () => ({
			valid: true,
			accountNumber: 'minuteinbox-temp',
		}),

		/**
		 * Detect MinuteInbox login page.
		 */
		detectLoginPage: (url: string) =>
			url.includes('minuteinbox.com/login') || url.includes('minuteinbox.com/signin'),

		/**
		 * WebSocket message for successful verification.
		 */
		onVerified: (result) => ({
			type: 'minuteinbox_verified',
			accountNumber: result.accountNumber,
		}),

		/**
		 * WebSocket message for failed verification.
		 */
		onVerificationFailed: (error) => ({
			type: 'minuteinbox_verification_failed',
			error,
		}),

		/**
		 * WebSocket message when login page detected.
		 */
		onLoginDetected: () => ({
			type: 'minuteinbox_login_page_detected',
		}),
	},

	/**
	 * Investing.com financial data platform configuration.
	 */
	investing: {
		...investingInterceptorConfig,

		createInterceptor: () => new InvestingInterceptor(),

		/**
		 * Verify Investing.com credentials via real API call.
		 */
		verifyCredentials: async (headers) => {
			try {
				const response = await fetch('https://www.investing.com/api/user/profile', { headers });
				if (!response.ok) {
					return { valid: false, error: 'Unauthorized' };
				}
				const data = (await response.json()) as any;
				return {
					valid: true,
					accountNumber: data.user_id,
					firstName: data.first_name,
					lastName: data.last_name,
				};
			} catch (error) {
				return {
					valid: false,
					error: error instanceof Error ? error.message : 'Verification failed',
				};
			}
		},

		/**
		 * Detect Investing.com login page.
		 */
		detectLoginPage: (url: string) => url.includes('investing.com/login'),

		/**
		 * WebSocket message for successful verification.
		 */
		onVerified: (result) => ({
			type: 'investing_verified',
			accountNumber: result.accountNumber,
			firstName: (result as any).firstName,
			lastName: (result as any).lastName,
		}),

		/**
		 * WebSocket message for failed verification.
		 */
		onVerificationFailed: (error) => ({
			type: 'investing_verification_failed',
			error,
		}),

		/**
		 * WebSocket message when login page detected.
		 */
		onLoginDetected: () => ({
			type: 'investing_login_page_detected',
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

/**
 * Check if a profile has domain-specific configuration.
 */
export function hasDomainConfig(profileName: string): boolean {
	return profileName in DOMAIN_CONFIGS;
}
