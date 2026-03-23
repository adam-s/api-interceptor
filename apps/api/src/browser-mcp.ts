/**
 * Browser MCP REST Endpoints
 *
 * Provides /browser/mcp/* REST endpoints that the MCP server
 * (packages/browser/src/mcp/server.ts) calls to control the browser.
 * Each endpoint delegates to the active RemoteBrowserService instance.
 *
 * @module api/browser-mcp
 */

import {
	clearTrafficBuffer,
	getActiveBrowser,
	getTrafficEntries,
} from '@interceptor/browser/handler';
import { Hono } from 'hono';

const browserMcp = new Hono();

/** Helper: get browser or return 503 */
function requireBrowser() {
	const browser = getActiveBrowser();
	if (!browser) {
		return null;
	}
	return browser;
}

// GET /status — browser connection status
browserMcp.get('/status', (c) => {
	const browser = getActiveBrowser();
	if (!browser) {
		return c.json({
			connected: false,
			url: null,
			viewport: null,
		});
	}
	return c.json({
		connected: true,
		url: browser.getUrl(),
		viewport: { width: 1024, height: 576 },
	});
});

// POST /navigate — navigate to a URL
browserMcp.post('/navigate', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { url } = await c.req.json<{ url: string }>();
	if (!url) {
		return c.json({ error: 'Missing required field: url' }, 400);
	}
	await browser.navigate(url);
	return c.json({ url: browser.getUrl() });
});

// POST /screenshot — take a screenshot and return base64 JPEG
browserMcp.post('/screenshot', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { quality } = await c.req.json<{ quality?: number }>();
	const page = browser.getPage();
	if (!page) {
		return c.json({ error: 'Browser page not available' }, 503);
	}
	const buffer = await page.screenshot({
		type: 'jpeg',
		quality: quality ?? 80,
	});
	const base64 = Buffer.from(buffer).toString('base64');
	return c.json({
		data: base64,
		mimeType: 'image/jpeg',
	});
});

// POST /click — click at coordinates
browserMcp.post('/click', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { x, y, button } = await c.req.json<{
		x: number;
		y: number;
		button?: 'left' | 'right' | 'middle';
	}>();
	if (typeof x !== 'number' || typeof y !== 'number') {
		return c.json({ error: 'Missing required fields: x, y' }, 400);
	}
	await browser.click(x, y, button ?? 'left');
	return c.json({ ok: true });
});

// POST /scroll — scroll at coordinates
browserMcp.post('/scroll', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { x, y, deltaX, deltaY } = await c.req.json<{
		x: number;
		y: number;
		deltaX?: number;
		deltaY?: number;
	}>();
	if (typeof x !== 'number' || typeof y !== 'number') {
		return c.json({ error: 'Missing required fields: x, y' }, 400);
	}
	await browser.scroll(x, y, deltaX ?? 0, deltaY ?? 300);
	return c.json({ ok: true });
});

// POST /type — type text
browserMcp.post('/type', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { text } = await c.req.json<{ text: string }>();
	if (!text) {
		return c.json({ error: 'Missing required field: text' }, 400);
	}
	await browser.type(text);
	return c.json({ ok: true });
});

// POST /key — press a keyboard key
browserMcp.post('/key', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { key } = await c.req.json<{ key: string }>();
	if (!key) {
		return c.json({ error: 'Missing required field: key' }, 400);
	}
	await browser.pressKey(key);
	return c.json({ ok: true });
});

// POST /evaluate — execute JavaScript in the browser page
browserMcp.post('/evaluate', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { script } = await c.req.json<{ script: string }>();
	if (!script) {
		return c.json({ error: 'Missing required field: script' }, 400);
	}
	const page = browser.getPage();
	if (!page) {
		return c.json({ error: 'Browser page not available' }, 503);
	}
	try {
		// Use page.evaluate with a string expression (not a function)
		// so the MCP client can send arbitrary JS strings
		const result = await page.evaluate(script);
		return c.json({ result });
	} catch (err) {
		return c.json(
			{ error: `Evaluate failed: ${err instanceof Error ? err.message : String(err)}` },
			400,
		);
	}
});

// GET /traffic — return captured traffic entries
browserMcp.get('/traffic', (c) => {
	const since = c.req.query('since');
	const sinceId = since ? Number.parseInt(since, 10) : undefined;
	return c.json(getTrafficEntries(sinceId));
});

// POST /traffic/clear — clear traffic buffer
browserMcp.post('/traffic/clear', (c) => {
	const cleared = clearTrafficBuffer();
	return c.json({ cleared });
});

// POST /fetch — make an HTTP request through the browser's session (cookies, WAF tokens)
// This runs fetch() inside the browser page context, forwarding all cookies.
// Use for testing API endpoints during discovery without writing route code.
browserMcp.post('/fetch', async (c) => {
	const browser = requireBrowser();
	if (!browser) {
		return c.json({ error: 'No active browser — connect via /browser/stream first' }, 503);
	}
	const { url, method, headers, body } = await c.req.json<{
		url: string;
		method?: string;
		headers?: Record<string, string>;
		body?: unknown;
	}>();
	if (!url) {
		return c.json({ error: 'Missing required field: url' }, 400);
	}
	const page = browser.getPage();
	if (!page) {
		return c.json({ error: 'Browser page not available' }, 503);
	}
	try {
		const fetchScript = `
			(async () => {
				const opts = {
					method: ${JSON.stringify(method || 'GET')},
					credentials: 'include',
					${headers ? `headers: ${JSON.stringify(headers)},` : ''}
					${body ? `body: JSON.stringify(${JSON.stringify(body)}),` : ''}
				};
				if (opts.body) opts.headers = { 'Content-Type': 'application/json', ...opts.headers };
				const res = await fetch(${JSON.stringify(url)}, opts);
				const ct = res.headers.get('content-type') || '';
				const text = await res.text();
				let data;
				try { data = JSON.parse(text); } catch { data = text; }
				return { status: res.status, contentType: ct, data };
			})()
		`;
		const result = await page.evaluate(fetchScript);
		return c.json(result);
	} catch (err) {
		return c.json(
			{ error: `Browser fetch failed: ${err instanceof Error ? err.message : String(err)}` },
			502,
		);
	}
});

export { browserMcp };
