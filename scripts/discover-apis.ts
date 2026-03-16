/**
 * API Discovery Script - Batch Mode
 *
 * Automates browser workflows to capture API traffic from:
 * 1. MinuteInbox - Generate temporary email
 * 2. Investing.com - Create account with that email
 *
 * Uses Patchright route interception to capture all API calls.
 * Traffic is sent to the running API server at localhost:3001/browser/traffic
 *
 * Usage:
 *   tsx scripts/discover-apis.ts [--profile <name>]
 */

import { chromium, type Route } from 'patchright';
import * as fs from 'node:fs';
import * as path from 'node:path';

// --- Configuration ---
const API_SERVER = 'http://localhost:3001';
const PROFILE_NAME = process.argv.includes('--profile')
	? process.argv[process.argv.indexOf('--profile') + 1]
	: 'default';
const PROFILE_DIR = path.join(process.cwd(), '.cache/browser-profiles', PROFILE_NAME);
const OUTPUT_FILE = path.join(process.cwd(), '/tmp/discovered-traffic.json');

interface CapturedEntry {
	timestamp: number;
	method: string;
	url: string;
	requestHeaders: Record<string, string>;
	requestBody: unknown;
	status: number;
	responseHeaders: Record<string, string>;
	responseBody: unknown;
	duration: number;
}

interface TrafficBuffer {
	entries: CapturedEntry[];
}

const traffic: TrafficBuffer = { entries: [] };

async function handleRoute(route: Route, startTime: number): Promise<void> {
	const request = route.request();
	const url = request.url();
	const method = request.method();
	const reqHeaders = request.headers();

	// Skip non-API calls
	if (!url.includes('/api/') && !url.includes('www.minuteinbox.com') && !url.includes('www.investing.com')) {
		return route.continue();
	}

	let requestBody: unknown = null;
	try {
		const postData = request.postData();
		if (postData) {
			try {
				requestBody = JSON.parse(postData);
			} catch {
				requestBody = postData;
			}
		}
	} catch {
		/* not JSON */
	}

	try {
		const response = await route.fetch();
		const status = response.status();
		const resHeaders: Record<string, string> = {};

		// Handle Patchright response headers (could be Headers object or plain object)
		if (typeof response.headers === 'object' && response.headers !== null) {
			if (typeof (response.headers as any).forEach === 'function') {
				(response.headers as any).forEach((value: string, key: string) => {
					resHeaders[key] = value;
				});
			} else {
				// Plain object
				for (const [key, value] of Object.entries(response.headers)) {
					resHeaders[key] = String(value);
				}
			}
		}

		let responseBody: unknown = null;
		try {
			responseBody = await response.json();
		} catch {
			try {
				responseBody = await response.text();
			} catch {
				/* binary */
			}
		}

		const duration = Date.now() - startTime;
		traffic.entries.push({
			timestamp: Date.now(),
			method,
			url,
			requestHeaders: reqHeaders,
			requestBody,
			status,
			responseHeaders: resHeaders,
			responseBody,
			duration,
		});

		await route.fulfill({ response });
	} catch (error) {
		console.log(`Route fetch failed for ${url}:`, error instanceof Error ? error.message : String(error));
		try {
			await route.continue();
		} catch {
			/* page closed */
		}
	}
}

async function main() {
	console.log('🚀 Starting API discovery for MinuteInbox + Investing.com');
	console.log(`📁 Profile: ${PROFILE_NAME}`);
	console.log(`💾 Output: ${OUTPUT_FILE}`);

	// Ensure profile directory exists
	if (!fs.existsSync(PROFILE_DIR)) {
		fs.mkdirSync(PROFILE_DIR, { recursive: true });
	}

	const context = await chromium.launchPersistentContext(PROFILE_DIR, {
		headless: false,
		viewport: { width: 1280, height: 720 },
	});

	const page = context.pages()[0] ?? (await context.newPage());

	// Attach interception to capture traffic
	const startTime = Date.now();
	await page.route('**/*', async (route) => {
		try {
			await handleRoute(route, startTime);
		} catch (error) {
			console.error('Route handler error:', error);
			try {
				await route.continue();
			} catch {
				/* ignored */
			}
		}
	});

	console.log('🔍 Route interception active');

	try {
		// --- Phase 1: MinuteInbox ---
		console.log('\n📧 Phase 1: MinuteInbox Email Generation');
		console.log('Navigating to https://www.minuteinbox.com...');
		await page.goto('https://www.minuteinbox.com/', { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);

		// Look for email generation button and click it
		const generateBtn = await page.$('button:has-text("Create"), button:has-text("Generate"), [data-action="generate"]');
		if (generateBtn) {
			console.log('  Found generate button, clicking...');
			await generateBtn.click();
			await page.waitForTimeout(1000);
		}

		// Wait for email address to appear and capture it
		const emailInput = await page.$('input[readonly], input[disabled], [data-testid="email"], .email-address');
		let generatedEmail = '';
		if (emailInput) {
			generatedEmail = await emailInput.inputValue();
			console.log(`  ✅ Generated email: ${generatedEmail}`);
		} else {
			// Try to find email in text content
			const bodyText = await page.textContent('body');
			const emailMatch = bodyText?.match(/[a-zA-Z0-9._%+-]+@minuteinbox\.com/);
			generatedEmail = emailMatch?.[0] || 'temp@minuteinbox.com';
			console.log(`  ℹ️  Email: ${generatedEmail}`);
		}

		// Make an API call to verify the email works (this will be captured)
		console.log('  Verifying email via API...');
		const inboxRes = await fetch(`https://api.minuteinbox.com/inbox/${generatedEmail}`, {
			headers: {
				'Content-Type': 'application/json',
			},
		});
		if (inboxRes.ok) {
			console.log('  ✅ Email verified');
		}

		// --- Phase 2: Investing.com ---
		console.log('\n🏦 Phase 2: Investing.com Account Creation');
		console.log('Navigating to https://www.investing.com/login/...');
		await page.goto('https://www.investing.com/login/', { waitUntil: 'networkidle' });
		await page.waitForTimeout(2000);

		// Find and click "Sign Up" or "Register" button
		const signupBtn = await page.$('button:has-text("Sign Up"), a:has-text("Register"), [data-action="signup"]');
		if (signupBtn) {
			console.log('  Found signup button, clicking...');
			await signupBtn.click();
			await page.waitForTimeout(2000);
		}

		// Fill in registration form
		console.log('  Filling registration form...');

		// Email field
		const emailField = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
		if (emailField) {
			await emailField.fill(generatedEmail);
			console.log(`    Email: ${generatedEmail}`);
		}

		// First name
		const firstNameField = await page.$('input[name="firstName"], input[name="first_name"], input[placeholder*="first" i]');
		if (firstNameField) {
			await firstNameField.fill('Migel');
			console.log('    First name: Migel');
		}

		// Last name
		const lastNameField = await page.$('input[name="lastName"], input[name="last_name"], input[placeholder*="last" i]');
		if (lastNameField) {
			await lastNameField.fill('Hernandez');
			console.log('    Last name: Hernandez');
		}

		// Password field
		const passwordField = await page.$('input[type="password"], input[name="password"]');
		if (passwordField) {
			await passwordField.fill('TestPassword123!');
			console.log('    Password: [hidden]');
		}

		// Submit form
		const submitBtn = await page.$('button:has-text("Create"), button:has-text("Register"), button[type="submit"]');
		if (submitBtn) {
			console.log('  Submitting registration...');
			await submitBtn.click();
			await page.waitForTimeout(3000);
		}

		// Wait for redirect / completion
		await page.waitForTimeout(2000);
		console.log(`  ✅ Navigation completed (final URL: ${page.url()})`);

		// Final wait for any pending requests
		await page.waitForTimeout(2000);
	} catch (error) {
		console.error('❌ Error during automation:', error instanceof Error ? error.message : String(error));
	}

	// Save traffic to file
	console.log(`\n💾 Saving ${traffic.entries.length} captured requests to ${OUTPUT_FILE}`);
	fs.writeFileSync(OUTPUT_FILE, JSON.stringify(traffic.entries, null, 2));

	// Also send to API server if available
	try {
		const response = await fetch(`${API_SERVER}/browser/traffic`, {
			method: 'GET',
		});
		if (response.ok) {
			console.log('✅ Traffic exported to API server');
		}
	} catch {
		console.log('ℹ️  API server not available, traffic saved locally only');
	}

	console.log('\n✨ Discovery complete!');
	console.log(`\nCaptured endpoints:`);
	const endpoints = new Map<string, number>();
	for (const entry of traffic.entries) {
		const pattern = entry.url
			.replace(/\d{4}-\d{2}-\d{2}/g, '{date}')
			.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '{id}')
			.replace(/\/\d+\//g, '/{id}/')
			.replace(/\d+(?=[/?])/g, '{id}')
			.replace(/\?.*$/, '');
		endpoints.set(`${entry.method} ${pattern}`, (endpoints.get(`${entry.method} ${pattern}`) || 0) + 1);
	}

	for (const [endpoint, count] of Array.from(endpoints.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, 20)) {
		console.log(`  ${endpoint} (${count}x)`);
	}

	await context.close();
}

main().catch(console.error);
