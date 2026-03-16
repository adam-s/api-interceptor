/**
 * StubHub API Routes
 *
 * Discovered from captured traffic on 2026-03-16.
 */

import type { DomainRoute } from '@interceptor/browser/handler/domain-loader';

export const routes: DomainRoute[] = [
	{
		method: 'POST',
		path: '/events/search',
		targetUrl: 'https://www.stubhub.com/jsa/v1/events',
		description: 'Search for events',
	},
	{
		method: 'POST',
		path: '/categories/popular',
		targetUrl:
			'https://www.stubhub.com/?method=MostPopularCategories&maxRows=20&categoryId=1015&page=0',
		description: 'Most popular event categories',
	},
	{
		method: 'POST',
		path: '/events/dont-miss',
		targetUrl: 'https://www.stubhub.com/?method=DontMissEvents&categoryId=0&maxRows=8&page=0',
		description: 'Featured events',
	},
];
