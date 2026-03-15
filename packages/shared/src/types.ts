export interface AppConfig {
	name: string;
	version: string;
	environment: 'development' | 'production' | 'test';
}
