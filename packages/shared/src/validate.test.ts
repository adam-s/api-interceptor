import { describe, expect, it } from 'vitest';
import { ConfigValidationError, validateConfig } from './validate';

describe('validateConfig', () => {
	it('returns a typed AppConfig for valid input', () => {
		const result = validateConfig({
			name: 'my-app',
			version: '1.0.0',
			environment: 'production',
		});

		expect(result).toEqual({
			name: 'my-app',
			version: '1.0.0',
			environment: 'production',
		});
	});

	it('accepts all valid environment values', () => {
		for (const env of ['development', 'production', 'test'] as const) {
			const result = validateConfig({
				name: 'app',
				version: '0.1.0',
				environment: env,
			});
			expect(result.environment).toBe(env);
		}
	});

	it('throws for null input', () => {
		expect(() => validateConfig(null)).toThrow(ConfigValidationError);
		expect(() => validateConfig(null)).toThrow('non-null object');
	});

	it('throws for undefined input', () => {
		expect(() => validateConfig(undefined)).toThrow(ConfigValidationError);
	});

	it('throws for non-object input', () => {
		expect(() => validateConfig('string')).toThrow(ConfigValidationError);
		expect(() => validateConfig(42)).toThrow(ConfigValidationError);
	});

	it('throws for missing name', () => {
		expect(() => validateConfig({ version: '1.0.0', environment: 'production' })).toThrow(
			ConfigValidationError,
		);
	});

	it('throws for empty name', () => {
		expect(() => validateConfig({ name: '  ', version: '1.0.0', environment: 'test' })).toThrow(
			'non-empty string',
		);
	});

	it('throws for missing version', () => {
		expect(() => validateConfig({ name: 'app', environment: 'production' })).toThrow(
			ConfigValidationError,
		);
	});

	it('throws for invalid environment', () => {
		expect(() =>
			validateConfig({
				name: 'app',
				version: '1.0.0',
				environment: 'staging',
			}),
		).toThrow(ConfigValidationError);
	});

	it('includes the field name in the error', () => {
		try {
			validateConfig({ name: '', version: '1.0.0', environment: 'production' });
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigValidationError);
			expect((error as ConfigValidationError).field).toBe('name');
		}
	});

	it('ignores extra fields', () => {
		const result = validateConfig({
			name: 'app',
			version: '1.0.0',
			environment: 'development',
			extra: 'ignored',
		});
		expect(result).toEqual({
			name: 'app',
			version: '1.0.0',
			environment: 'development',
		});
	});
});
