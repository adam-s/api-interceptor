import type { AppConfig } from "@volat/shared";

export function formatStartupBanner(config: AppConfig): string {
	return `${config.name} v${config.version} [${config.environment}]`;
}
