/**
 * Robinhood Authentication Service
 *
 * Extends GenericAuthService with Robinhood-specific configuration.
 * Manages browser-based authentication with Robinhood using
 * persistent profiles for session management.
 *
 * @module browser/robinhood/auth
 */

import { type AuthConfig, GenericAuthService } from '@interceptor/browser/shared/auth';
import { RobinhoodInterceptor } from './interceptor';

/** Robinhood-specific auth configuration */
export interface RobinhoodAuthConfig extends AuthConfig {
	// All fields inherited from AuthConfig
}

const DEFAULT_CONFIG: Required<AuthConfig> = {
	profileName: 'robinhood-trading',
	headless: false,
	viewportWidth: 1280,
	viewportHeight: 800,
	enableAdBlocking: true,
	accountSelector: '[data-testid="account-number"]',
	accountUrl: 'https://robinhood.com/account',
};

/** Robinhood URLs */
const ROBINHOOD_URLS = {
	HOME: 'https://robinhood.com',
	LOGIN: 'https://robinhood.com/login',
	ACCOUNT: 'https://robinhood.com/account',
} as const;

// Re-export AuthState for backward compatibility
export type { AuthState } from '@interceptor/browser/shared/auth';

/**
 * Robinhood Authentication Service.
 *
 * Manages browser sessions with persistent profiles for maintaining
 * authentication state across restarts.
 *
 * Usage:
 * ```typescript
 * const auth = new RobinhoodAuthService();
 * const state = await auth.startSession();
 *
 * if (state.status === 'needs-login') {
 *   // Browser is open, user needs to log in manually
 *   // Poll getState() until authenticated
 * }
 *
 * if (state.status === 'connected') {
 *   // Can now use state.headers for API calls
 * }
 * ```
 */
export class RobinhoodAuthService extends GenericAuthService {
	constructor(config: RobinhoodAuthConfig = {}) {
		const merged = { ...DEFAULT_CONFIG, ...config };
		super(merged);
	}

	/**
	 * Create the Robinhood interceptor.
	 */
	protected createInterceptor(): RobinhoodInterceptor {
		return new RobinhoodInterceptor();
	}

	/**
	 * Get the Robinhood login URL.
	 */
	protected getLoginUrl(): string {
		return ROBINHOOD_URLS.LOGIN;
	}

	/**
	 * Get the Robinhood account URL.
	 */
	protected getAccountUrl(): string {
		return ROBINHOOD_URLS.ACCOUNT;
	}

	/**
	 * Navigate to the login page.
	 */
	async goToLogin(): Promise<void> {
		await this.navigate(ROBINHOOD_URLS.LOGIN);
	}

	/**
	 * Navigate to the account page.
	 */
	async goToAccount(): Promise<void> {
		await this.navigate(ROBINHOOD_URLS.ACCOUNT);
	}
}
