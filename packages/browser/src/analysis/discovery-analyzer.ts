/**
 * Discovery Analyzer
 *
 * Pre-processes captured browser traffic and page HTML to surface the most
 * important information for API discovery. Returns structured JSON with:
 * - Framework detection (Next.js, SvelteKit, Nuxt, Angular, React SPA, jQuery)
 * - Embedded JSON data blocks (<script type="application/json">, __NEXT_DATA__, etc.)
 * - Tokens (CSRF, API keys, session IDs from hidden inputs, meta tags, cookies, inline scripts)
 * - API endpoints (filtered, classified by transport type)
 * - WebSocket URLs from inline scripts
 * - GraphQL operations from POST request bodies
 * - Skip counts (JS chunks, tracking pixels, fonts filtered out)
 *
 * All functions are pure — they take HTML and traffic entries, return structured data.
 *
 * @module browser/analysis/discovery-analyzer
 */

import * as cheerio from 'cheerio';
import {
	classifyEntry,
	type TrafficClassification,
	type TrafficEntry,
} from '../shared/classify-transport.js';

// ─── Output Types ──────────────────────────────────────────────────

export interface DiscoveryAnalysis {
	/** Detected web framework */
	framework: FrameworkDetection;
	/** Embedded JSON data blocks found in the HTML */
	embeddedData: EmbeddedDataBlock[];
	/** Tokens discovered (CSRF, API keys, session IDs, etc.) */
	tokens: DiscoveredToken[];
	/** API endpoints from traffic (filtered and classified) */
	apiEndpoints: ClassifiedEndpoint[];
	/** WebSocket URLs found in inline scripts */
	websocketUrls: string[];
	/** GraphQL operations found in POST request bodies */
	graphqlOperations: GraphQLOperation[];
	/** Counts of filtered-out (non-data) traffic entries */
	skipCounts: SkipCounts;
	/** Page URL that was analyzed */
	pageUrl: string;
	/** Timestamp of the analysis */
	timestamp: string;
}

export interface FrameworkDetection {
	/** Detected framework name, or "unknown" */
	name: string;
	/** Evidence that led to the detection */
	evidence: string[];
	/** Confidence level */
	confidence: 'high' | 'medium' | 'low';
}

export interface EmbeddedDataBlock {
	/** The script tag ID or identifier */
	id: string;
	/** Type attribute of the script tag */
	type: string;
	/** Size of the JSON content in bytes */
	sizeBytes: number;
	/** Preview of the data (first 500 chars) */
	preview: string;
	/** Top-level keys if the data is an object */
	topLevelKeys: string[];
}

export interface DiscoveredToken {
	/** Token name / identifier */
	name: string;
	/** Where the token was found */
	source: 'hidden-input' | 'meta-tag' | 'cookie' | 'inline-script' | 'embedded-json' | 'header';
	/** The token value (truncated for security) */
	value: string;
	/** CSS selector or location description */
	location: string;
}

export interface ClassifiedEndpoint {
	/** HTTP method */
	method: string;
	/** Request URL */
	url: string;
	/** Transport classification */
	transport: TrafficClassification['transport'];
	/** Response status code */
	status: number;
	/** Response content type */
	contentType: string;
	/** Classification evidence */
	evidence: string;
	/** Response body size hint (if available) */
	responseSizeHint?: string;
}

export interface GraphQLOperation {
	/** Operation name */
	operationName: string;
	/** The endpoint URL */
	url: string;
	/** Variable keys (not values) */
	variableKeys: string[];
	/** Whether it uses persisted queries */
	persisted: boolean;
}

export interface SkipCounts {
	/** Number of JS chunk requests filtered out */
	jsChunks: number;
	/** Number of CSS requests filtered out */
	css: number;
	/** Number of image requests filtered out */
	images: number;
	/** Number of font requests filtered out */
	fonts: number;
	/** Number of tracking/analytics requests filtered out */
	tracking: number;
	/** Total skipped */
	total: number;
}

// ─── Framework Detection ───────────────────────────────────────────

export function detectFramework(html: string, $?: cheerio.CheerioAPI): FrameworkDetection {
	$ = $ ?? cheerio.load(html);
	const evidence: string[] = [];

	// Next.js markers
	if ($('script#__NEXT_DATA__').length > 0) {
		evidence.push('Found <script id="__NEXT_DATA__">');
	}
	if (html.includes('/_next/')) {
		evidence.push('Found /_next/ asset paths');
	}
	if ($('meta[name="next-head-count"]').length > 0) {
		evidence.push('Found <meta name="next-head-count">');
	}

	if (evidence.length > 0) {
		return { name: 'Next.js', evidence, confidence: evidence.length >= 2 ? 'high' : 'medium' };
	}

	// SvelteKit markers
	if ($('[data-sveltekit-fetched]').length > 0) {
		evidence.push('Found data-sveltekit-fetched attribute');
	}
	if (html.includes('__sveltekit/')) {
		evidence.push('Found __sveltekit/ path');
	}
	if ($('script[data-sveltekit-hydrate]').length > 0) {
		evidence.push('Found data-sveltekit-hydrate script');
	}

	if (evidence.length > 0) {
		return { name: 'SvelteKit', evidence, confidence: evidence.length >= 2 ? 'high' : 'medium' };
	}

	// Nuxt markers
	if ($('script#__NUXT_DATA__').length > 0 || html.includes('__NUXT__')) {
		evidence.push('Found __NUXT_DATA__ or __NUXT__ global');
	}
	if (html.includes('/_nuxt/')) {
		evidence.push('Found /_nuxt/ asset paths');
	}

	if (evidence.length > 0) {
		return { name: 'Nuxt', evidence, confidence: evidence.length >= 2 ? 'high' : 'medium' };
	}

	// Angular markers
	if ($('[ng-app]').length > 0 || $('[data-ng-app]').length > 0) {
		evidence.push('Found ng-app attribute (AngularJS)');
	}
	if ($('app-root').length > 0) {
		evidence.push('Found <app-root> (Angular)');
	}
	if (html.includes('ng-version=')) {
		evidence.push('Found ng-version attribute');
	}

	if (evidence.length > 0) {
		return { name: 'Angular', evidence, confidence: evidence.length >= 2 ? 'high' : 'medium' };
	}

	// React SPA markers (generic React without Next.js)
	if ($('#root').length > 0 || $('#app').length > 0) {
		const rootEl = $('#root').length > 0 ? '#root' : '#app';
		// Check if root element has data-reactroot or is empty (hydration target)
		if (html.includes('data-reactroot') || html.includes('_reactRootContainer')) {
			evidence.push(`Found React root container at ${rootEl}`);
		}
	}
	if (html.includes('react.') || html.includes('react-dom')) {
		evidence.push('Found react/react-dom script references');
	}

	if (evidence.length > 0) {
		return { name: 'React SPA', evidence, confidence: evidence.length >= 2 ? 'high' : 'medium' };
	}

	// jQuery markers
	if (html.includes('jquery') || html.includes('jQuery')) {
		evidence.push('Found jQuery reference');
		return { name: 'jQuery', evidence, confidence: 'low' };
	}

	// Embedded JSON without framework — custom SSR / static site
	const embeddedScripts = $('script[type="application/json"]');
	if (embeddedScripts.length > 0) {
		evidence.push(`Found ${embeddedScripts.length} embedded JSON script tag(s)`);
		return {
			name: 'Custom SSR (embedded JSON)',
			evidence,
			confidence: 'medium',
		};
	}

	return { name: 'unknown', evidence: ['No framework markers detected'], confidence: 'low' };
}

// ─── Embedded Data Extraction ──────────────────────────────────────

export function extractEmbeddedData(html: string, $?: cheerio.CheerioAPI): EmbeddedDataBlock[] {
	$ = $ ?? cheerio.load(html);
	const blocks: EmbeddedDataBlock[] = [];

	// <script type="application/json"> blocks
	$('script[type="application/json"]').each((_i, el) => {
		const scriptEl = $(el);
		const id = scriptEl.attr('id') ?? `anonymous-${_i}`;
		const content = scriptEl.html() ?? '';
		const sizeBytes = Buffer.byteLength(content, 'utf-8');

		let topLevelKeys: string[] = [];
		let preview = content.slice(0, 500);
		try {
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				topLevelKeys = Object.keys(parsed);
			}
		} catch {
			preview = `[Parse error] ${content.slice(0, 500)}`;
		}

		blocks.push({
			id,
			type: 'application/json',
			sizeBytes,
			preview,
			topLevelKeys,
		});
	});

	// __NEXT_DATA__
	$('script#__NEXT_DATA__').each((_i, el) => {
		const content = $(el).html() ?? '';
		// Skip if already captured as application/json
		if (blocks.some((b) => b.id === '__NEXT_DATA__')) return;

		const sizeBytes = Buffer.byteLength(content, 'utf-8');
		let topLevelKeys: string[] = [];
		try {
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed === 'object') {
				topLevelKeys = Object.keys(parsed);
			}
		} catch {
			/* ignore */
		}

		blocks.push({
			id: '__NEXT_DATA__',
			type: 'application/json',
			sizeBytes,
			preview: content.slice(0, 500),
			topLevelKeys,
		});
	});

	// data-sveltekit-fetched scripts
	$('script[data-sveltekit-fetched]').each((_i, el) => {
		const content = $(el).html() ?? '';
		const sizeBytes = Buffer.byteLength(content, 'utf-8');
		let topLevelKeys: string[] = [];
		try {
			const parsed = JSON.parse(content);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				topLevelKeys = Object.keys(parsed);
			}
		} catch {
			/* ignore */
		}

		blocks.push({
			id: `sveltekit-fetched-${_i}`,
			type: 'sveltekit-fetched',
			sizeBytes,
			preview: content.slice(0, 500),
			topLevelKeys,
		});
	});

	return blocks;
}

// ─── Token Discovery ───────────────────────────────────────────────

function truncateToken(value: string, maxLen = 20): string {
	if (value.length <= maxLen) return value;
	return `${value.slice(0, maxLen)}...`;
}

export function discoverTokens(
	html: string,
	trafficEntries: TrafficEntry[],
	$?: cheerio.CheerioAPI,
): DiscoveredToken[] {
	$ = $ ?? cheerio.load(html);
	const tokens: DiscoveredToken[] = [];

	// 1. Hidden inputs
	$('input[type="hidden"]').each((_i, el) => {
		const input = $(el);
		const name = input.attr('name') ?? input.attr('id') ?? `hidden-${_i}`;
		const value = input.attr('value') ?? '';
		if (value) {
			tokens.push({
				name,
				source: 'hidden-input',
				value: truncateToken(value),
				location: `input[type="hidden"][name="${name}"]`,
			});
		}
	});

	// 2. Meta tags (api-key, csrf-token, etc.)
	$('meta[name]').each((_i, el) => {
		const meta = $(el);
		const name = meta.attr('name') ?? '';
		const content = meta.attr('content') ?? '';
		// Look for token-like meta tags
		const tokenPatterns = [
			'api-key',
			'api_key',
			'apikey',
			'csrf',
			'token',
			'secret',
			'session',
			'nonce',
			'client-id',
			'client_id',
		];
		if (content && tokenPatterns.some((p) => name.toLowerCase().includes(p))) {
			tokens.push({
				name,
				source: 'meta-tag',
				value: truncateToken(content),
				location: `<meta name="${name}">`,
			});
		}
	});

	// 3. Cookies from Set-Cookie headers in traffic
	const cookiesSeen = new Set<string>();
	for (const entry of trafficEntries) {
		const setCookie =
			entry.responseHeaders?.['set-cookie'] ?? entry.responseHeaders?.['Set-Cookie'] ?? '';
		if (!setCookie) continue;

		// Parse cookie name=value pairs — split on comma but skip commas inside date values
		// (e.g., "Expires=Thu, 01 Dec 2025"). Split on comma followed by a cookie name pattern.
		const cookies = setCookie.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_]*=)/).map((c) => c.trim());
		for (const cookie of cookies) {
			const match = cookie.match(/^([^=]+)=([^;]*)/);
			if (match && !cookiesSeen.has(match[1])) {
				cookiesSeen.add(match[1]);
				tokens.push({
					name: match[1],
					source: 'cookie',
					value: truncateToken(match[2]),
					location: `Set-Cookie: ${match[1]}=...`,
				});
			}
		}
	}

	// 4. Inline script globals (window.__X__ = ...)
	$('script:not([src]):not([type])').each((_i, el) => {
		const content = $(el).html() ?? '';
		// Match window.SOMETHING = ... or var SOMETHING = ...
		const windowGlobalPattern = /window\.(__[A-Z_]+__)\s*=\s*(\{[\s\S]*?\});/g;
		let match: RegExpExecArray | null;
		match = windowGlobalPattern.exec(content);
		while (match !== null) {
			const globalName = match[1];
			const globalValue = match[2];
			// Try to parse and find token-like values
			try {
				const parsed = JSON.parse(globalValue);
				if (parsed && typeof parsed === 'object') {
					for (const [key, val] of Object.entries(parsed)) {
						if (typeof val === 'string' && val.length > 8) {
							const tokenLike = [
								'id',
								'token',
								'session',
								'csrf',
								'key',
								'secret',
								'nonce',
								'auth',
							];
							if (tokenLike.some((t) => key.toLowerCase().includes(t))) {
								tokens.push({
									name: `${globalName}.${key}`,
									source: 'inline-script',
									value: truncateToken(val),
									location: `window.${globalName}.${key}`,
								});
							}
						}
					}
				}
			} catch {
				/* not valid JSON — skip */
			}
			match = windowGlobalPattern.exec(content);
		}
	});

	// 5. Tokens inside embedded JSON blocks
	$('script[type="application/json"]').each((_i, el) => {
		const scriptEl = $(el);
		const id = scriptEl.attr('id') ?? `embedded-${_i}`;
		const content = scriptEl.html() ?? '';
		try {
			const parsed = JSON.parse(content);
			findTokensInObject(parsed, id, tokens, 'embedded-json');
		} catch {
			/* not valid JSON */
		}
	});

	return tokens;
}

/** Recursively search an object for token-like string values. */
function findTokensInObject(
	obj: unknown,
	prefix: string,
	tokens: DiscoveredToken[],
	source: DiscoveredToken['source'],
	depth = 0,
): void {
	if (depth > 3 || !obj || typeof obj !== 'object') return;

	const record = obj as Record<string, unknown>;
	const tokenKeys = [
		'filterSessionId',
		'sessionId',
		'csrfToken',
		'csrf',
		'apiKey',
		'api_key',
		'token',
		'accessToken',
		'access_token',
		'refreshToken',
		'nonce',
		'crumb',
		'secret',
		'auth',
	];

	for (const [key, val] of Object.entries(record)) {
		if (typeof val === 'string' && val.length > 8) {
			if (tokenKeys.some((t) => key.toLowerCase().includes(t.toLowerCase()))) {
				tokens.push({
					name: `${prefix}.${key}`,
					source,
					value: truncateToken(val),
					location: `<script id="${prefix}"> -> ${key}`,
				});
			}
		} else if (Array.isArray(val)) {
			// Recurse into arrays — tokens can be in [{token: "..."}] patterns (BUG-20)
			for (let i = 0; i < Math.min(val.length, 5); i++) {
				if (val[i] && typeof val[i] === 'object') {
					findTokensInObject(val[i], `${prefix}.${key}[${i}]`, tokens, source, depth + 1);
				}
			}
		} else if (typeof val === 'object' && val !== null) {
			findTokensInObject(val, `${prefix}.${key}`, tokens, source, depth + 1);
		}
	}
}

// ─── Traffic Filtering & Classification ────────────────────────────

const TRACKING_PATTERNS = [
	'google-analytics',
	'googletagmanager',
	'google.com/ccm',
	'googleadservices',
	'doubleclick.net',
	'facebook.com/tr',
	'connect.facebook.net',
	'segment.io',
	'segment.com',
	'sentry.io',
	'bugsnag.com',
	'hotjar.com',
	'fullstory.com',
	'amplitude.com',
	'mixpanel.com',
	'forter.com',
	'riskified.com',
	'branch.io',
	'adjust.com',
	'appsflyer.com',
	'fingerprintjs.com',
	'arkoselabs.com',
	'awswaf.com',
	'bat.bing.com',
	'px.ads',
	'analytics',
	'telemetry',
	'beacon',
	'pixel',
	'track',
];

interface CategorizedTraffic {
	apiEntries: TrafficEntry[];
	skipCounts: SkipCounts;
}

export function categorizeTraffic(entries: TrafficEntry[]): CategorizedTraffic {
	const counts: SkipCounts = {
		jsChunks: 0,
		css: 0,
		images: 0,
		fonts: 0,
		tracking: 0,
		total: 0,
	};
	const apiEntries: TrafficEntry[] = [];

	for (const entry of entries) {
		const url = entry.url.toLowerCase();
		const path = url.split('?')[0];

		// JS chunks
		if (path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.js.map')) {
			counts.jsChunks++;
			counts.total++;
			continue;
		}

		// CSS
		if (path.endsWith('.css') || path.endsWith('.css.map')) {
			counts.css++;
			counts.total++;
			continue;
		}

		// Images
		if (
			path.endsWith('.png') ||
			path.endsWith('.jpg') ||
			path.endsWith('.jpeg') ||
			path.endsWith('.gif') ||
			path.endsWith('.svg') ||
			path.endsWith('.webp') ||
			path.endsWith('.ico') ||
			path.endsWith('.avif')
		) {
			counts.images++;
			counts.total++;
			continue;
		}

		// Fonts
		if (
			path.endsWith('.woff') ||
			path.endsWith('.woff2') ||
			path.endsWith('.ttf') ||
			path.endsWith('.eot') ||
			path.endsWith('.otf')
		) {
			counts.fonts++;
			counts.total++;
			continue;
		}

		// Tracking / analytics
		if (TRACKING_PATTERNS.some((p) => url.includes(p))) {
			counts.tracking++;
			counts.total++;
			continue;
		}

		// Source maps
		if (path.endsWith('.map')) {
			counts.jsChunks++;
			counts.total++;
			continue;
		}

		apiEntries.push(entry);
	}

	return { apiEntries, skipCounts: counts };
}

export function classifyEndpoints(entries: TrafficEntry[]): ClassifiedEndpoint[] {
	return entries.map((entry) => {
		const classification = classifyEntry(entry);
		const ct = (
			entry.responseHeaders?.['content-type'] ??
			entry.responseHeaders?.['Content-Type'] ??
			''
		).toLowerCase();

		let responseSizeHint: string | undefined;
		if (entry.responseBody !== undefined) {
			try {
				const bodyStr = JSON.stringify(entry.responseBody);
				responseSizeHint = formatBytes(Buffer.byteLength(bodyStr, 'utf-8'));
			} catch {
				responseSizeHint = 'unknown';
			}
		}

		return {
			method: entry.method,
			url: entry.url,
			transport: classification.transport,
			status: entry.status,
			contentType: ct,
			evidence: classification.evidence,
			responseSizeHint,
		};
	});
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── WebSocket URL Discovery ───────────────────────────────────────

export function findWebSocketUrls(html: string, $?: cheerio.CheerioAPI): string[] {
	const urls = new Set<string>();

	// Search all inline scripts for wss:// or ws:// URLs
	$ = $ ?? cheerio.load(html);
	$('script:not([type="application/json"])').each((_i, el) => {
		const content = $(el).html() ?? '';
		// Match wss:// and ws:// URLs
		const wsPattern = /(?:"|')?(wss?:\/\/[^\s"'`<>]+)(?:"|')?/g;
		let match: RegExpExecArray | null;
		match = wsPattern.exec(content);
		while (match !== null) {
			urls.add(match[1]);
			match = wsPattern.exec(content);
		}
	});

	// Also check for WebSocket constructor calls
	$('script:not([type="application/json"])').each((_i, el) => {
		const content = $(el).html() ?? '';
		const constructorPattern = /new\s+WebSocket\s*\(\s*(?:"|'|`)(wss?:\/\/[^"'`]+)(?:"|'|`)/g;
		let match: RegExpExecArray | null;
		match = constructorPattern.exec(content);
		while (match !== null) {
			urls.add(match[1]);
			match = constructorPattern.exec(content);
		}
	});

	return Array.from(urls);
}

// ─── GraphQL Operation Discovery ───────────────────────────────────

export function findGraphQLOperations(entries: TrafficEntry[]): GraphQLOperation[] {
	const operations: GraphQLOperation[] = [];
	const seenOps = new Set<string>();

	for (const entry of entries) {
		if (entry.method !== 'POST') continue;

		const body = entry.requestBody;
		if (!body || typeof body !== 'object') continue;

		// Handle single GraphQL request
		const bodies = Array.isArray(body) ? body : [body];

		for (const reqBody of bodies) {
			const gqlBody = reqBody as Record<string, unknown>;

			// Check for GraphQL markers
			const hasQuery = typeof gqlBody.query === 'string';
			const hasPersistedQuery =
				gqlBody.extensions &&
				typeof gqlBody.extensions === 'object' &&
				(gqlBody.extensions as Record<string, unknown>).persistedQuery;
			const operationName =
				typeof gqlBody.operationName === 'string' ? gqlBody.operationName : undefined;

			if (!hasQuery && !hasPersistedQuery) continue;

			const opKey = `${operationName ?? 'anonymous'}:${entry.url}`;
			if (seenOps.has(opKey)) continue;
			seenOps.add(opKey);

			let variableKeys: string[] = [];
			if (gqlBody.variables && typeof gqlBody.variables === 'object') {
				variableKeys = Object.keys(gqlBody.variables as Record<string, unknown>);
			}

			operations.push({
				operationName: operationName ?? 'anonymous',
				url: entry.url,
				variableKeys,
				persisted: !!hasPersistedQuery,
			});
		}
	}

	return operations;
}

// ─── Main Analyzer ─────────────────────────────────────────────────

/**
 * Run the full discovery analysis on HTML + traffic entries.
 *
 * This is the main entry point. It composes all the individual analysis
 * functions into a single structured result.
 */
export function analyzeDiscovery(
	html: string,
	trafficEntries: TrafficEntry[],
	pageUrl: string,
): DiscoveryAnalysis {
	// Parse HTML once — reused by all analysis functions (PERF-6 fix)
	const $ = cheerio.load(html);

	const framework = detectFramework(html, $);
	const embeddedData = extractEmbeddedData(html, $);
	const tokens = discoverTokens(html, trafficEntries, $);
	const { apiEntries, skipCounts } = categorizeTraffic(trafficEntries);
	const apiEndpoints = classifyEndpoints(apiEntries);
	const websocketUrls = findWebSocketUrls(html, $);
	const graphqlOperations = findGraphQLOperations(trafficEntries);

	return {
		framework,
		embeddedData,
		tokens,
		apiEndpoints,
		websocketUrls,
		graphqlOperations,
		skipCounts,
		pageUrl,
		timestamp: new Date().toISOString(),
	};
}
