import type { AppConfig } from '@interceptor/shared';

export function formatStartupBanner(config: AppConfig): string {
	return `${config.name} v${config.version} [${config.environment}]`;
}
