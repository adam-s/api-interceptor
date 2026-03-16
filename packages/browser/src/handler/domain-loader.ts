/**
 * Domain Plugin Loader
 *
 * Provides a runtime registry for domain plugins. Domain packages
 * (e.g., @interceptor/domain-robinhood) export a DomainPlugin object
 * and register it at application startup.
 *
 * The browser handler uses getDomain() to look up plugins by name.
 * The framework has zero knowledge of specific domains — all domain
 * logic lives in separate packages.
 *
 * Usage:
 *   // In your app's startup (e.g., apps/api/src/register-domains.ts):
 *   import { registerDomain } from '@interceptor/browser/handler';
 *   import { plugin } from '@interceptor/domain-robinhood';
 *   registerDomain(plugin);
 *
 *   // In the browser handler (automatic):
 *   const plugin = getDomain('robinhood');
 *   if (plugin) { ... attach interceptor, verify credentials, etc. }
 *
 * @module browser/handler/domain-loader
 */

import type { InterceptorConfig, VerificationResult } from '../shared/config.js';
import type { GenericInterceptor } from '../shared/interceptor.js';

/**
 * Domain plugin contract.
 *
 * Each domain package exports an object implementing this interface.
 * It provides everything needed to intercept, verify, and generate
 * WebSocket messages for a specific website.
 */
export interface DomainPlugin {
	/** Unique domain name (e.g., 'robinhood', 'investing', 'minuteinbox') */
	domainName: string;

	/** Interceptor configuration (URL patterns, required headers, schema) */
	config: InterceptorConfig;

	/** Factory: create a new interceptor instance for this domain */
	createInterceptor: () => GenericInterceptor;

	/** Optional: verify captured credentials against the real API */
	verifyCredentials?: (headers: Record<string, string>) => Promise<VerificationResult>;

	/** Optional: detect if current URL is the login page */
	detectLoginPage?: (url: string) => boolean;

	/** Optional: WebSocket message when verification succeeds */
	onVerified?: (result: VerificationResult) => Record<string, unknown>;

	/** Optional: WebSocket message when verification fails */
	onVerificationFailed?: (error: string) => Record<string, unknown>;

	/** Optional: WebSocket message when login page detected */
	onLoginDetected?: () => Record<string, unknown>;
}

// --- Runtime Registry ---

const plugins = new Map<string, DomainPlugin>();

/**
 * Register a domain plugin.
 *
 * Call this at application startup for each domain you want to support.
 * Typically done in a register-domains.ts file that imports domain packages.
 */
export function registerDomain(plugin: DomainPlugin): void {
	if (plugins.has(plugin.domainName)) {
		console.warn(`[DomainLoader] Overwriting existing plugin: ${plugin.domainName}`);
	}
	plugins.set(plugin.domainName, plugin);
}

/**
 * Get a registered domain plugin by name.
 * Returns undefined if the domain is not registered.
 */
export function getDomain(name: string): DomainPlugin | undefined {
	return plugins.get(name);
}

/**
 * Check if a domain is registered.
 */
export function hasDomain(name: string): boolean {
	return plugins.has(name);
}

/**
 * List all registered domain names.
 */
export function listDomains(): string[] {
	return Array.from(plugins.keys());
}

/**
 * Clear all registered domains (useful for testing).
 */
export function clearDomains(): void {
	plugins.clear();
}
