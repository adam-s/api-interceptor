/**
 * DOM Analyzer — Extracts discovery-relevant data from the browser's live DOM.
 *
 * This module exports a single self-contained function that is serialized and
 * executed inside the browser via `page.evaluate()`. Because of serialization
 * constraints, the function MUST NOT close over any outer variables, import
 * modules, or reference anything outside its own body.
 *
 * What it extracts (matching the Data Transport Discovery Protocol):
 *   - Framework detection (__NEXT_DATA__, Svelte, Angular, Nuxt, React)
 *   - Embedded JSON blobs (<script type="application/json">, __NEXT_DATA__, etc.)
 *   - Tokens (hidden inputs, meta tags, inline script variable assignments)
 *   - WebSocket URLs found in inline <script> text
 *   - Custom data elements (data-field, data-testid, data-value attributes)
 *
 * @module browser/analysis/dom-analyzer
 */

/**
 * Result shape returned by the DOM analyzer function.
 * Every field is a plain JSON-serializable value.
 */
export interface DomAnalysisResult {
	/** Detected frontend frameworks */
	frameworks: string[];

	/** Embedded JSON blobs found in <script> tags */
	embeddedJson: Array<{
		/** Source selector (e.g. "script#__NEXT_DATA__", "script[type=application/json]") */
		selector: string;
		/** Tag id attribute (if present) */
		id: string | null;
		/** Tag type attribute (if present) */
		type: string | null;
		/** Byte size of the JSON text */
		size: number;
		/** First 500 characters of the JSON text */
		preview: string;
	}>;

	/** Tokens discovered in the page (hidden inputs, meta tags, inline scripts) */
	tokens: Array<{
		/** Where the token was found */
		source: 'hidden-input' | 'meta-tag' | 'inline-script';
		/** Name/key of the token */
		name: string;
		/** Value (first 200 chars, masked if looks like a secret) */
		value: string;
		/** Selector to locate this element */
		selector: string;
	}>;

	/** WebSocket URLs discovered in inline script content */
	websocketUrls: string[];

	/** Custom data elements grouped by attribute type */
	dataElements: {
		dataField: Array<{ selector: string; field: string; tagName: string; textPreview: string }>;
		dataTestid: Array<{ selector: string; testid: string; tagName: string; textPreview: string }>;
		dataValue: Array<{ selector: string; value: string; tagName: string; textPreview: string }>;
	};

	/** Page metadata */
	meta: {
		url: string;
		title: string;
		/** Total number of <script> tags on the page */
		scriptTagCount: number;
		/** Total number of <meta> tags on the page */
		metaTagCount: number;
	};
}

/**
 * The self-contained DOM analyzer function.
 *
 * This is passed to `page.evaluate()` — it MUST be fully self-contained
 * with zero imports, zero closures, and zero references to outer scope.
 * It runs inside the browser's JS context and returns a plain JSON object.
 */
export function domAnalyzerFn(): DomAnalysisResult {
	// --- Framework Detection ---
	const frameworks: string[] = [];

	// Next.js: __NEXT_DATA__ script tag or window property
	if (
		document.getElementById('__NEXT_DATA__') ||
		(window as unknown as Record<string, unknown>).__NEXT_DATA__
	) {
		frameworks.push('next.js');
	}

	// Nuxt: __NUXT_DATA__ or __NUXT__ or #__nuxt
	if (
		document.querySelector('[id^="__NUXT"]') ||
		(window as unknown as Record<string, unknown>).__NUXT__ ||
		(window as unknown as Record<string, unknown>).__NUXT_DATA__
	) {
		frameworks.push('nuxt');
	}

	// SvelteKit: data-sveltekit-fetched attribute
	if (document.querySelector('[data-sveltekit-fetched]')) {
		frameworks.push('sveltekit');
	}

	// Angular: ng-version attribute
	const ngVersionEl = document.querySelector('[ng-version]');
	if (ngVersionEl) {
		frameworks.push(`angular@${ngVersionEl.getAttribute('ng-version')}`);
	}

	// React: data-reactroot, data-reactid, or React fiber internals on #root / #__next
	if (!frameworks.includes('next.js')) {
		const hasReactAttr =
			document.querySelector('[data-reactroot]') || document.querySelector('[data-reactid]');
		const rootEl = document.getElementById('root') || document.getElementById('__next');
		const hasReactFiber =
			rootEl &&
			Object.keys(rootEl).some(
				(k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'),
			);
		if (hasReactAttr || hasReactFiber) {
			frameworks.push('react');
		}
	}

	// --- Embedded JSON ---
	const embeddedJson: DomAnalysisResult['embeddedJson'] = [];
	const jsonScripts = document.querySelectorAll(
		'script[type="application/json"], script[type="application/ld+json"], script#__NEXT_DATA__, [data-sveltekit-fetched]',
	);
	for (const script of jsonScripts) {
		const text = script.textContent || '';
		if (text.trim().length === 0) continue;
		const id = script.getAttribute('id');
		const type = script.getAttribute('type');
		let selector = 'script';
		if (id) selector += `#${id}`;
		else if (type) selector += `[type="${type}"]`;
		embeddedJson.push({
			selector,
			id,
			type,
			size: text.length,
			preview: text.slice(0, 500),
		});
	}

	// --- Token Discovery ---
	const tokens: DomAnalysisResult['tokens'] = [];
	const TOKEN_PATTERNS = /token|csrf|nonce|key|secret|auth|session|api[_-]?key/i;

	// Hidden inputs
	const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
	for (const input of hiddenInputs) {
		const name = input.getAttribute('name') || input.getAttribute('id') || '';
		const value = (input as HTMLInputElement).value || '';
		if (!name && !value) continue;
		// Include all hidden inputs — they often carry tokens
		const sel = input.getAttribute('id')
			? `input#${input.getAttribute('id')}`
			: input.getAttribute('name')
				? `input[name="${input.getAttribute('name')}"]`
				: 'input[type="hidden"]';
		tokens.push({
			source: 'hidden-input',
			name: name || '(unnamed)',
			value: value.length > 200 ? `${value.slice(0, 200)}...` : value,
			selector: sel,
		});
	}

	// Meta tags with token/csrf/key/auth in name or property
	const metaTags = document.querySelectorAll('meta[name], meta[property], meta[http-equiv]');
	for (const meta of metaTags) {
		const name =
			meta.getAttribute('name') ||
			meta.getAttribute('property') ||
			meta.getAttribute('http-equiv') ||
			'';
		const content = meta.getAttribute('content') || '';
		if (TOKEN_PATTERNS.test(name) && content) {
			tokens.push({
				source: 'meta-tag',
				name,
				value: content.length > 200 ? `${content.slice(0, 200)}...` : content,
				selector: `meta[name="${name}"]`,
			});
		}
	}

	// Inline script variable assignments matching token patterns
	const inlineScripts = document.querySelectorAll('script:not([src])');
	const ASSIGN_RE =
		/(?:var|let|const|window\.)\s*([\w.]+(?:token|csrf|nonce|key|secret|auth|session|api[_-]?key)[\w.]*)\s*=\s*["']([^"']{4,})["']/gi;
	for (const script of inlineScripts) {
		const text = script.textContent || '';
		if (!text) continue;
		ASSIGN_RE.lastIndex = 0; // Reset stateful regex for each script element
		let match: RegExpExecArray | null;
		// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
		while ((match = ASSIGN_RE.exec(text)) !== null) {
			tokens.push({
				source: 'inline-script',
				name: match[1],
				value: match[2].length > 200 ? `${match[2].slice(0, 200)}...` : match[2],
				selector: 'script (inline)',
			});
		}
	}

	// --- WebSocket URL Discovery ---
	const websocketUrls: string[] = [];
	const WSS_RE = /wss?:\/\/[^\s"'`<>]+/g;
	for (const script of inlineScripts) {
		const text = script.textContent || '';
		WSS_RE.lastIndex = 0; // Reset stateful regex for each script element
		let wsMatch: RegExpExecArray | null;
		// biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop pattern
		while ((wsMatch = WSS_RE.exec(text)) !== null) {
			const url = wsMatch[0].replace(/[;,)\]}]+$/, ''); // strip trailing punctuation
			if (!websocketUrls.includes(url)) {
				websocketUrls.push(url);
			}
		}
	}

	// --- Custom Data Elements ---
	const dataField: DomAnalysisResult['dataElements']['dataField'] = [];
	const dataFieldEls = document.querySelectorAll('[data-field]');
	for (const el of dataFieldEls) {
		const field = el.getAttribute('data-field') || '';
		const tagName = el.tagName.toLowerCase();
		dataField.push({
			selector: `${tagName}[data-field="${field}"]`,
			field,
			tagName,
			textPreview: (el.textContent || '').trim().slice(0, 100),
		});
	}

	const dataTestid: DomAnalysisResult['dataElements']['dataTestid'] = [];
	const testIdEls = document.querySelectorAll('[data-testid]');
	for (const el of testIdEls) {
		const testid = el.getAttribute('data-testid') || '';
		const tagName = el.tagName.toLowerCase();
		dataTestid.push({
			selector: `${tagName}[data-testid="${testid}"]`,
			testid,
			tagName,
			textPreview: (el.textContent || '').trim().slice(0, 100),
		});
	}

	const dataValue: DomAnalysisResult['dataElements']['dataValue'] = [];
	const dataValueEls = document.querySelectorAll('[data-value]');
	for (const el of dataValueEls) {
		const value = el.getAttribute('data-value') || '';
		const tagName = el.tagName.toLowerCase();
		dataValue.push({
			selector: `${tagName}[data-value="${value}"]`,
			value,
			tagName,
			textPreview: (el.textContent || '').trim().slice(0, 100),
		});
	}

	// --- Page Metadata ---
	const meta = {
		url: window.location.href,
		title: document.title,
		scriptTagCount: document.querySelectorAll('script').length,
		metaTagCount: document.querySelectorAll('meta').length,
	};

	return {
		frameworks,
		embeddedJson,
		tokens,
		websocketUrls,
		dataElements: { dataField, dataTestid, dataValue },
		meta,
	};
}
