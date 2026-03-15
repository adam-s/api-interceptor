import { describe, expect, it } from 'vitest';
import { formatStartupBanner } from './format';

describe('formatStartupBanner', () => {
	it('formats config into a startup banner', () => {
		const result = formatStartupBanner({
			name: 'interceptor-api',
			version: '0.0.1',
			environment: 'development',
		});
		expect(result).toBe('interceptor-api v0.0.1 [development]');
	});

	it('reflects the environment in the output', () => {
		const result = formatStartupBanner({
			name: 'app',
			version: '2.0.0',
			environment: 'production',
		});
		expect(result).toBe('app v2.0.0 [production]');
	});
});
