/**
 * Ticketmaster API Routes
 *
 * Generated from captured traffic on 2026-03-16.
 * These routes are proxied through the browser's authenticated session
 * via browserFetch(), inheriting cookies and session state.
 *
 * Discovery command:
 *   Connect browser: ?profile=ticketmaster&capture=ticketmaster.com&url=https://www.ticketmaster.com/discover/concerts
 *   Capture traffic, then codegen extracts these routes.
 */

import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';

export const routes: DomainRoute[] = [
	{
		method: 'GET',
		path: '/config/menu',
		targetUrl: 'https://www.ticketmaster.com/api/config/menu',
		description: 'Site navigation menu configuration',
	},
	{
		method: 'GET',
		path: '/trending/searches',
		targetUrl: 'https://www.ticketmaster.com/api/trending/searches/attraction',
		description: 'Trending event searches',
	},
	{
		method: 'GET',
		path: '/identity/signed-in',
		targetUrl: 'https://identity.ticketmaster.com/json/signed-in?hard=true',
		description: 'Check authentication status',
	},
	{
		method: 'GET',
		path: '/promoted/browse-category',
		targetUrl: 'https://promoted.ticketmaster.com/browse-category',
		description: 'Promoted events by category and market',
	},
	{
		method: 'GET',
		path: '/promoted/tmpid',
		targetUrl: 'https://promoted.ticketmaster.com/get-tmpid',
		description: 'Generate temporary promotion ID',
	},
	{
		method: 'GET',
		path: '/analytics/page-view',
		targetUrl: 'https://analytics.ticketmaster.com/api/page/view',
		description: 'Page view analytics',
	},
	{
		method: 'POST',
		path: '/tracking/page-view',
		targetUrl: 'https://www.ticketmaster.com/epsf/gec/v3/pageView',
		description: 'Page view tracking event',
	},
];
