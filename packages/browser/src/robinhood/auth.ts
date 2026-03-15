/**
 * Robinhood Authentication Service
 *
 * Manages browser-based authentication with Robinhood using
 * persistent profiles for session management.
 *
 * @module browser/robinhood/auth
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'patchright';
import { chromium } from 'patchright';
import { BlockerManager } from '../blocker';
import { RobinhoodInterceptor } from './interceptor';
import type { AuthState, RobinhoodHeaders } from './types';

/** Configuration for the auth service */
export interface RobinhoodAuthConfig {
	/** Profile name for persistent storage (default: 'robinhood-trading') */
	profileName?: string;
	/** Whether to run headless - NOT recommended for login (default: false) */
	headless?: boolean;
	/** Viewport width (default: 1280) */
	viewportWidth?: number;
	/** Viewport height (default: 800) */
	viewportHeight?: number;
	/** Enable ad blocking (default: true) */
	enableAdBlocking?: boolean;
}

const DEFAULT_CONFIG: Required<RobinhoodAuthConfig> = {
	profileName: 'robinhood-trading',
	headless: false,
	viewportWidth: 1280,
	viewportHeight: 800,
	enableAdBlocking: true,
};

/** Robinhood URLs */
const ROBINHOOD_URLS = {
	HOME: 'https://robinhood.com',
	LOGIN: 'https://robinhood.com/login',
	ACCOUNT: 'https://robinhood.com/account',
} as const;

/**
 * Get the profiles directory for Robinhood auth.
 */
function getProfilesDir(): string {
	const envDir = process.env.BROWSER_PROFILES_DIR;
	if (envDir) {
		return envDir;
	}
	return join(process.cwd(), 'data', 'browser-profiles');
}

/**
 * Get or create a profile path for the given name.
 */
function getOrCreateProfilePath(profileName: string): string {
	const profilesDir = getProfilesDir();
	const profilePath = join(profilesDir, profileName);

	if (!existsSync(profilePath)) {
		mkdirSync(profilePath, { recursive: true });
		console.log(`[RobinhoodAuth] Created profile directory: ${profilePath}`);
	}

	return profilePath;
}

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
export class RobinhoodAuthService {
	private config: Required<RobinhoodAuthConfig>;
	private context: BrowserContext | null = null;
	private page: Page | null = null;
	private interceptor: RobinhoodInterceptor | null = null;
	private state: AuthState = { status: 'disconnected' };
	private sessionId: string;

	constructor(config: RobinhoodAuthConfig = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.sessionId = crypto.randomUUID();
	}

	/**
	 * Get the current session ID.
	 */
	getSessionId(): string {
		return this.sessionId;
	}

	/**
	 * Get the current authentication state.
	 */
	getState(): AuthState {
		return this.state;
	}

	/**
	 * Get captured headers if authenticated.
	 */
	getCapturedHeaders(): RobinhoodHeaders | null {
		return this.interceptor?.getHeaders() ?? null;
	}

	/**
	 * Get the browser page for streaming/embedding.
	 */
	getPage(): Page | null {
		return this.page;
	}

	/**
	 * Start or resume an authentication session.
	 *
	 * If the profile has valid cookies, returns connected state.
	 * Otherwise, returns needs-login state with browser open.
	 */
	async startSession(): Promise<AuthState> {
		if (this.context) {
			console.log('[RobinhoodAuth] Session already started');
			return this.state;
		}

		this.state = { status: 'connecting' };

		try {
			// Get profile path for persistent context
			const profilePath = getOrCreateProfilePath(this.config.profileName);
			console.log(`[RobinhoodAuth] Using profile: ${profilePath}`);

			// Launch persistent context
			const executablePath = process.env.CHROMIUM_PATH || undefined;
			this.context = await chromium.launchPersistentContext(profilePath, {
				executablePath,
				headless: this.config.headless,
				viewport: {
					width: this.config.viewportWidth,
					height: this.config.viewportHeight,
				},
				args: ['--disable-infobars', '--disable-blink-features=AutomationControlled'],
			});

			// Get or create page
			const pages = this.context.pages();
			this.page = pages.length > 0 ? pages[0] : await this.context.newPage();

			// Enable ad blocking
			if (this.config.enableAdBlocking) {
				const blocker = BlockerManager.getInstance();
				await blocker.enableBlockingSilent(this.page);
			}

			// Attach interceptor
			this.interceptor = new RobinhoodInterceptor();
			await this.interceptor.attach(this.page);

			// Navigate to account page to check auth status
			console.log('[RobinhoodAuth] Navigating to Robinhood...');
			await this.page.goto(ROBINHOOD_URLS.ACCOUNT, { waitUntil: 'domcontentloaded' });

			// Wait a moment for any redirects
			await this.page.waitForTimeout(2000);

			// Check if we're logged in by looking at the URL
			const currentUrl = this.page.url();
			console.log(`[RobinhoodAuth] Current URL: ${currentUrl}`);

			if (currentUrl.includes('/login')) {
				// User needs to log in
				this.state = { status: 'needs-login', sessionId: this.sessionId };
				console.log('[RobinhoodAuth] Login required');
			} else {
				// Try to capture headers - wait briefly for API calls
				const headers = await this.interceptor.waitForHeaders(5000);

				if (headers) {
					// Get account number from account page or API
					const accountNumber = await this.extractAccountNumber();
					this.state = {
						status: 'connected',
						headers,
						accountNumber: accountNumber || 'Unknown',
					};
					console.log('[RobinhoodAuth] Connected with headers');
				} else {
					// Have cookies but no API calls yet
					// Could be logged in but need to trigger an API call
					this.state = { status: 'needs-login', sessionId: this.sessionId };
					console.log('[RobinhoodAuth] No headers captured, may need login');
				}
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			this.state = { status: 'error', message };
			console.error('[RobinhoodAuth] Error starting session:', error);
		}

		return this.state;
	}

	/**
	 * Check authentication status and wait for headers if needed.
	 */
	async checkAuth(timeoutMs = 5000): Promise<AuthState> {
		if (!this.interceptor) {
			return { status: 'error', message: 'No active session' };
		}

		const headers = await this.interceptor.waitForHeaders(timeoutMs);

		if (headers) {
			const accountNumber = await this.extractAccountNumber();
			this.state = {
				status: 'connected',
				headers,
				accountNumber: accountNumber || 'Unknown',
			};
		}

		return this.state;
	}

	/**
	 * Extract account number from the page or make API call.
	 */
	private async extractAccountNumber(): Promise<string | null> {
		if (!this.page) return null;

		try {
			// Try to find account number in the page content
			const accountNumber = await this.page.evaluate(() => {
				// Look for account number in common locations
				const accountElement = document.querySelector('[data-testid="account-number"]');
				if (accountElement) {
					return accountElement.textContent?.trim() || null;
				}

				// Try URL path for account pages
				const match = window.location.pathname.match(/\/account\/([A-Z0-9]+)/);
				if (match) {
					return match[1];
				}

				return null;
			});

			return accountNumber;
		} catch {
			return null;
		}
	}

	/**
	 * Navigate to a specific URL.
	 */
	async navigate(url: string): Promise<void> {
		if (!this.page) {
			throw new Error('No active session');
		}
		await this.page.goto(url, { waitUntil: 'domcontentloaded' });
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

	/**
	 * Disconnect and clean up the session.
	 */
	async disconnect(): Promise<void> {
		console.log('[RobinhoodAuth] Disconnecting...');

		if (this.interceptor) {
			await this.interceptor.detach();
			this.interceptor = null;
		}

		if (this.context) {
			await this.context.close();
			this.context = null;
		}

		this.page = null;
		this.state = { status: 'disconnected' };
		console.log('[RobinhoodAuth] Disconnected');
	}

	/**
	 * Clear cookies and storage (logout).
	 */
	async clearSession(): Promise<void> {
		if (!this.context) return;

		console.log('[RobinhoodAuth] Clearing session data...');
		await this.context.clearCookies();

		if (this.interceptor) {
			this.interceptor.clearHeaders();
		}

		this.state = { status: 'disconnected' };
		console.log('[RobinhoodAuth] Session cleared');
	}
}
