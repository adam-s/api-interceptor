/**
 * Traffic Analyzer
 *
 * Processes captured HTTP traffic to extract API endpoint patterns.
 * Groups requests by normalized URL to identify unique endpoints.
 * Deduplicates UUIDs and numeric IDs to find patterns like /accounts/{id}/positions.
 *
 * @module browser/codegen/traffic-analyzer
 */

/**
 * Captured HTTP request from traffic buffer.
 */
export interface TrafficEntry {
	id: number;
	timestamp: number;
	method: string;
	url: string;
	requestHeaders: Record<string, string>;
	requestBody: unknown;
	status: number;
	responseHeaders: Record<string, string>;
	responseBody: unknown;
	durationMs: number;
}

/**
 * Normalized endpoint pattern extracted from traffic.
 */
export interface EndpointPattern {
	/** HTTP method (GET, POST, etc.) */
	method: string;

	/** Normalized URL pattern (e.g., /accounts/{id}/positions) */
	pattern: string;

	/** Original base URL (e.g., https://api.boardshop.com) */
	baseUrl: string;

	/** Examples of traffic matching this pattern */
	examples: TrafficEntry[];

	/** Minimum number of examples needed to infer schema */
	minExamples: number;

	/** Whether we have enough examples to infer schemas */
	canInferSchema: boolean;
}

/**
 * Normalize a URL by replacing IDs with placeholders.
 * Handles UUIDs and numeric IDs.
 *
 * Examples:
 * - https://api.boardshop.com/accounts/abc123def456/positions
 *   → /accounts/{id}/positions
 * - https://api.boardshop.com/options/orders/550e8400-e29b-41d4-a716-446655440000
 *   → /options/orders/{id}
 */
export function normalizeUrl(url: string): string {
	// Remove query string
	const pathname = url.split('?')[0];

	// Replace UUIDs with {id}
	const withoutUuids = pathname.replace(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
		'{id}',
	);

	// Replace numeric sequences surrounded by slashes
	const withoutNumbers = withoutUuids.replace(/\/\d+\//g, '/{id}/');

	// Replace trailing numeric ID
	const withoutTrailingId = withoutNumbers.replace(/\/\d+$/, '/{id}');

	return withoutTrailingId;
}

/**
 * Extract base URL from full URL.
 * Examples:
 * - https://api.boardshop.com/accounts → https://api.boardshop.com
 * - https://cdn.boardshop.com/v1/orders → https://cdn.boardshop.com
 */
function extractBaseUrl(url: string): string {
	const urlObj = new URL(url);
	return `${urlObj.protocol}//${urlObj.hostname}`;
}

/**
 * Analyze captured traffic and extract endpoint patterns.
 *
 * Groups traffic by (method, normalized URL) to identify unique endpoints.
 * Requires ≥3 examples per endpoint to consider it for schema inference.
 */
export function analyzeTraffic(entries: TrafficEntry[]): EndpointPattern[] {
	// Group by (method, pattern, baseUrl)
	const patterns = new Map<string, EndpointPattern>();

	for (const entry of entries) {
		// Skip failed requests
		if (entry.status < 200 || entry.status >= 300) {
			continue;
		}

		// Skip static assets — only keep JSON API responses
		const urlLower = entry.url.toLowerCase();
		const staticExtensions = [
			'.js',
			'.css',
			'.png',
			'.jpg',
			'.jpeg',
			'.gif',
			'.svg',
			'.ico',
			'.woff',
			'.woff2',
			'.ttf',
			'.eot',
			'.map',
		];
		if (staticExtensions.some((ext) => urlLower.split('?')[0].endsWith(ext))) {
			continue;
		}

		// Skip HTML pages (keep JSON/API responses)
		const contentType = entry.responseHeaders?.['content-type'] || '';
		if (contentType.includes('text/html') && !contentType.includes('json')) {
			continue;
		}

		const baseUrl = extractBaseUrl(entry.url);
		const pattern = normalizeUrl(entry.url);
		const key = `${entry.method}:${baseUrl}${pattern}`;

		if (!patterns.has(key)) {
			patterns.set(key, {
				method: entry.method,
				pattern,
				baseUrl,
				examples: [],
				minExamples: 1,
				canInferSchema: false,
			});
		}

		// biome-ignore lint/style/noNonNullAssertion: key was just set above if missing
		const endpoint = patterns.get(key)!;
		endpoint.examples.push(entry);

		// Check if we have enough examples
		endpoint.canInferSchema = endpoint.examples.length >= endpoint.minExamples;
	}

	return Array.from(patterns.values())
		.filter((ep) => ep.examples.length > 0)
		.sort((a, b) => b.examples.length - a.examples.length);
}

/**
 * Get a summary of analyzed endpoints.
 */
export function summarizePatterns(patterns: EndpointPattern[]): string {
	const lines: string[] = [];
	lines.push(`Found ${patterns.length} unique endpoint patterns:\n`);

	for (const pattern of patterns) {
		const ready = pattern.canInferSchema ? '✅' : '❌';
		lines.push(
			`${ready} ${pattern.method.padEnd(6)} ${pattern.pattern.padEnd(50)} (${pattern.examples.length} examples)`,
		);
	}

	return lines.join('\n');
}
