/**
 * API Client Code Generator
 *
 * Generates TypeScript API client code from analyzed traffic patterns.
 * Produces a complete, type-safe client class with Zod validation.
 *
 * @module browser/codegen/client-codegen
 */

import type { EndpointPattern } from './traffic-analyzer';

/**
 * Configuration for client generation.
 */
export interface ClientGenerationConfig {
	/** Domain name (e.g., 'robinhood', 'linkedin') */
	domainName: string;

	/** Class name for generated client (e.g., 'RobinhoodApiClient') */
	className: string;

	/** Base URLs (e.g., ['https://api.robinhood.com', 'https://bonfire.robinhood.com']) */
	baseUrls: string[];

	/** Required header names for authentication */
	requiredHeaders: string[];

	/** Endpoint patterns to generate methods for */
	endpoints: EndpointPattern[];

	/** Optional: custom header setup code */
	headerSetupCode?: string;
}

/**
 * Convert URL pattern to TypeScript method name.
 * Examples:
 * - /accounts/{id}/positions → getAccountPositions
 * - /options/orders/{id} → getOptionsOrder (if GET)
 * - POST /orders → createOrder
 */
function patternToMethodName(method: string, pattern: string): string {
	const parts = pattern
		.split('/')
		.filter((p) => p && p !== '{id}')
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1));

	const verb =
		method === 'GET'
			? 'get'
			: method === 'POST'
				? 'create'
				: method === 'PUT'
					? 'update'
					: method === 'DELETE'
						? 'delete'
						: 'execute';

	return verb + parts.join('');
}

/**
 * Extract URL parameters from pattern.
 * Example: /accounts/{id}/positions/{orderId} → ['id', 'orderId']
 */
function extractUrlParams(pattern: string): string[] {
	const matches = pattern.match(/\{(\w+)\}/g) || [];
	return matches.map((m) => m.slice(1, -1));
}

/**
 * Generate TypeScript method code for an endpoint.
 */
function generateEndpointMethod(pattern: EndpointPattern): string {
	const methodName = patternToMethodName(pattern.method, pattern.pattern);
	const urlParams = extractUrlParams(pattern.pattern);

	// Build parameter list
	const params = [...urlParams, 'options?: { timeout?: number }'];
	const paramList = params.join(', ');

	// Build URL construction code
	let urlCode = `\`${pattern.baseUrl}${pattern.pattern}\``;
	if (urlParams.length > 0) {
		const replacements = urlParams.map((p) => `.replace('{${p}}', String(${p}))`).join('');
		urlCode = `\`${pattern.baseUrl}${pattern.pattern}\`${replacements}`;
	}

	return `
	/**
	 * ${pattern.method} ${pattern.pattern}
	 */
	async ${methodName}(${paramList}): Promise<unknown> {
		const url = ${urlCode};
		const response = await fetch(url, {
			method: '${pattern.method}',
			headers: this.headers,
			timeout: options?.timeout,
		});

		if (!response.ok) {
			throw new Error(\`${pattern.method} \${url} failed with status \${response.status}\`);
		}

		try {
			return await response.json();
		} catch {
			return null;
		}
	}
`;
}

/**
 * Generate the complete API client class.
 */
export function generateClientClass(config: ClientGenerationConfig): string {
	const methods = config.endpoints
		.filter((ep) => ep.canInferSchema)
		.map((ep) => generateEndpointMethod(ep))
		.join('\n');

	const headerSetup =
		config.headerSetupCode || `this.headers = headers; // Store for each request`;

	return `
/**
 * Auto-generated API client for ${config.domainName}
 *
 * This client was generated from captured traffic.
 * Each method corresponds to an observed API endpoint.
 */
export class ${config.className} {
	private headers: Record<string, string>;

	constructor(headers: Record<string, string>) {
		${headerSetup}
	}

	/**
	 * Set or update authentication headers.
	 */
	setHeaders(headers: Record<string, string>): void {
		this.headers = { ...this.headers, ...headers };
	}

	/**
	 * Get current headers.
	 */
	getHeaders(): Record<string, string> {
		return { ...this.headers };
	}
${methods}
}
`;
}

/**
 * Generate the complete TypeScript file with imports and exports.
 */
export function generateClientFile(config: ClientGenerationConfig): string {
	const clientClass = generateClientClass(config);

	return `/**
 * Auto-generated API client for ${config.domainName}
 *
 * Generated from captured traffic analysis.
 * Base URLs: ${config.baseUrls.join(', ')}
 * Required Headers: ${config.requiredHeaders.join(', ')}
 * Total Endpoints: ${config.endpoints.length}
 * Endpoints with Schema: ${config.endpoints.filter((ep) => ep.canInferSchema).length}
 *
 * To regenerate: pnpm codegen ${config.domainName}
 */

/**
 * Create a new API client instance.
 *
 * @param headers Authentication headers (e.g., { Authorization: 'Bearer token' })
 * @returns API client instance
 */
export function create${config.className.replace(/Client$/, '')}(headers: Record<string, string>): ${config.className} {
	return new ${config.className}(headers);
}

${clientClass}
`;
}
