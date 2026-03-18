/**
 * Import LinkedIn cookies into api-interceptor browser profile.
 * Usage: ./node_modules/.bin/tsx scripts/import-linkedin-cookies.ts
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'patchright';

const TARGET_PROFILE = join(process.cwd(), 'data/browser-profiles/generic');

const cookies = [
	{
		name: 'li_at',
		value: 'AQEDAWOPfigADO_6AAABnP7RZ_8AAAGdIt3r_1YAbxh-l4HpRxytDNLkXYktuN5rG85YtJi_WxR4p1pXFh_JvXcdtBDKnXek2Fn_AlB1DBARpDVvsDHUdaLtK6L4JHw03TRHCnWQ3QCUahqe_RyTCk5_',
		domain: '.www.linkedin.com',
		path: '/',
		expires: new Date('2027-03-18T02:41:02.443Z').getTime() / 1000,
		httpOnly: true,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'JSESSIONID',
		value: '"ajax:4402570319093850112"',
		domain: '.www.linkedin.com',
		path: '/',
		expires: new Date('2026-06-16T02:41:02.443Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'liap',
		value: 'true',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2026-06-16T02:41:02.443Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'bcookie',
		value: '"v=2&3aa4739b-934b-4f44-856c-c45f1bbaaede"',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2027-03-18T02:41:07.009Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'bscookie',
		value: '"v=1&20260318023852c50b666f-48b0-488e-8faf-85988f496da1AQFLqjSE8xn1ZtZcR_LhkPBvpR1ac34Z"',
		domain: '.www.linkedin.com',
		path: '/',
		expires: new Date('2027-03-18T02:41:05.462Z').getTime() / 1000,
		httpOnly: true,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'dfpfpt',
		value: '87f4f66e98ff4d7689a98c233b116da3',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2027-03-18T02:41:06.074Z').getTime() / 1000,
		httpOnly: true,
		secure: true,
		sameSite: 'Lax' as const,
	},
	{
		name: 'lang',
		value: 'v=2&lang=en-us',
		domain: '.linkedin.com',
		path: '/',
		expires: -1,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'lidc',
		value: '"b=VB28:s=V:r=V:a=V:p=V:g=4710:u=3:x=1:i=1773801667:t=1773886828:v=2:sig=AQET7C6Rywhcrmdg_MdkGZmNBour8JKO"',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2026-03-19T02:20:28.257Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'li_sugr',
		value: '511a58fa-3041-4971-8b3c-595f95a014e4',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2026-06-16T02:41:06.009Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'li_theme',
		value: 'light',
		domain: '.www.linkedin.com',
		path: '/',
		expires: new Date('2026-09-14T02:41:03.000Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'Lax' as const,
	},
	{
		name: 'li_theme_set',
		value: 'app',
		domain: '.www.linkedin.com',
		path: '/',
		expires: new Date('2026-09-14T02:41:03.000Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'Lax' as const,
	},
	{
		name: 'lms_ads',
		value: 'AQH0HxFt9YbGuAAAAZz-0XQ8L0THS12Ze8kSATbkHMUYdw-Z119o1B9nFOKW_Df4zyZarFNPZDNuU78L94OieE8Ff6rHb0s3',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2026-04-17T02:41:05.461Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'lms_analytics',
		value: 'AQH0HxFt9YbGuAAAAZz-0XQ8L0THS12Ze8kSATbkHMUYdw-Z119o1B9nFOKW_Df4zyZarFNPZDNuU78L94OieE8Ff6rHb0s3',
		domain: '.linkedin.com',
		path: '/',
		expires: new Date('2026-04-17T02:41:05.461Z').getTime() / 1000,
		httpOnly: false,
		secure: true,
		sameSite: 'None' as const,
	},
	{
		name: 'fptctx2',
		value: 'taBcrIH61PuCVH7eNCyH0K%252fD9DJ44Cptuv0RyrXgXCurSLOOU0HieKPEDr%252bKan0TasWVTmGUFeKURqNuDK8mx6gyaokahAeWIuHrleoOYt0vnYc%252fvs9eriAPv3459mVCpRAPB3gsM9O%252f0gzuc5qaqYROb1rzNxdhbeLnjIBmJBS%252f8%252bZ%252bl6rOIYizrc7mBAxOJHnludWHWjEV8PoMpbtMCoeVHWiQg%252ftrmtidXbjM5K2GLxQJl7Tp1nl6Lmj24PY1vSwI4hjtjNyItXYTAr6Ltz8yCRbBBjjoo1RjDMF7PvH%252bikg1o0mlfXwmhHcFLjqetYpF8pnyfdGx0fsEMKgNo1gijo7xW7xLFknHtzeKtca6JXIbh2JLDbOPy9P0FcAcj8IcxNityHhj8whpA2HCAw%253d%253d',
		domain: '.linkedin.com',
		path: '/',
		expires: -1,
		httpOnly: true,
		secure: true,
		sameSite: 'Lax' as const,
	},
];

async function main() {
	if (!existsSync(TARGET_PROFILE)) {
		mkdirSync(TARGET_PROFILE, { recursive: true });
	}

	console.log('Injecting LinkedIn cookies into api-interceptor profile...');
	const ctx = await chromium.launchPersistentContext(TARGET_PROFILE, {
		channel: 'chrome',
		headless: true,
		args: ['--disable-blink-features=AutomationControlled'],
	});

	await ctx.addCookies(cookies);
	console.log(`  Injected ${cookies.length} cookies`);

	// Verify
	console.log('\nVerifying — loading LinkedIn feed...');
	const page = ctx.pages()[0] || (await ctx.newPage());
	await page.goto('https://www.linkedin.com/feed/', {
		waitUntil: 'domcontentloaded',
		timeout: 30000,
	});
	await page.waitForTimeout(3000);

	const url = page.url();
	const title = await page.title();
	console.log(`  URL: ${url}`);
	console.log(`  Title: ${title}`);

	if (url.includes('/feed') && !url.includes('/login')) {
		console.log('\nLinkedIn session imported successfully!');
	} else {
		console.log('\nSession did not transfer — cookies may be expired or invalid');
	}

	await ctx.close();
}

main().catch((e) => {
	console.error('Error:', e.message);
	process.exit(1);
});
