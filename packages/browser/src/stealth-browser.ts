/**
 * Stealth Browser
 *
 * Thin wrapper around Patchright for launching stealth browser instances.
 * Patchright is a patched Chromium fork designed to avoid bot detection.
 *
 * @module browser
 */

import type { Browser, BrowserContext } from 'patchright';
import { chromium } from 'patchright';

export interface BrowserOptions {
	headless?: boolean;
	proxy?: string;
}

export async function createBrowser(options: BrowserOptions = {}): Promise<Browser> {
	const { headless = true, proxy } = options;
	const launchOptions: Parameters<typeof chromium.launch>[0] = { headless };
	if (proxy) {
		launchOptions.proxy = { server: proxy };
	}
	return await chromium.launch(launchOptions);
}

export async function createBrowserContext(
	browser: Browser,
	options: { viewport?: { width: number; height: number }; userAgent?: string } = {},
): Promise<BrowserContext> {
	return await browser.newContext({
		viewport: options.viewport ?? { width: 1440, height: 900 },
		...(options.userAgent && { userAgent: options.userAgent }),
	});
}
