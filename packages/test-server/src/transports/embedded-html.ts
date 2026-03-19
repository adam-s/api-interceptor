/**
 * Embedded HTML transport — generates HTML pages with JSON data islands.
 * Used by boardshop and liveboard sites.
 */

export interface EmbeddedPageOptions {
	title: string;
	/** JSON data to embed in <script id="..." type="application/json"> */
	dataScripts: Array<{ id: string; data: unknown }>;
	/** Inline JS to set window globals */
	windowGlobals?: Record<string, unknown>;
	/** Hidden input tokens */
	hiddenInputs?: Array<{ id: string; name: string; value: string }>;
	/** Meta tags */
	metaTags?: Array<{ name: string; content: string }>;
	/** Custom elements in the body */
	bodyHtml?: string;
	/** Set-Cookie headers to include */
	cookies?: Array<{ name: string; value: string; path?: string }>;
}

export function renderEmbeddedPage(opts: EmbeddedPageOptions): string {
	const dataScriptTags = opts.dataScripts
		.map((s) => `<script id="${s.id}" type="application/json">${JSON.stringify(s.data)}</script>`)
		.join('\n');

	const globalScript = opts.windowGlobals
		? `<script>${Object.entries(opts.windowGlobals)
				.map(([k, v]) => `window.${k} = ${JSON.stringify(v)};`)
				.join('\n')}</script>`
		: '';

	const hiddenInputs = (opts.hiddenInputs ?? [])
		.map((i) => `<input type="hidden" id="${i.id}" name="${i.name}" value="${i.value}">`)
		.join('\n');

	const metaTags = (opts.metaTags ?? [])
		.map((m) => `<meta name="${m.name}" content="${m.content}">`)
		.join('\n');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<title>${opts.title}</title>
${metaTags}
</head>
<body>
${hiddenInputs}
${opts.bodyHtml ?? ''}
${dataScriptTags}
${globalScript}
</body>
</html>`;
}
