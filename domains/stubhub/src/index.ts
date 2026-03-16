import type { DomainPlugin } from '@interceptor/browser/handler/domain-loader';
import { stubhubInterceptorConfig } from './config';
import { StubHubInterceptor } from './interceptor';
import { routes } from './routes';

export const plugin: DomainPlugin = {
	domainName: 'stubhub',
	config: stubhubInterceptorConfig,
	routes,
	createInterceptor: () => new StubHubInterceptor(),
	detectLoginPage: (url: string) => url.includes('stubhub.com/login'),
	onVerified: (result) => ({ type: 'stubhub_verified', accountNumber: result.accountNumber }),
	onVerificationFailed: (error) => ({ type: 'stubhub_verification_failed', error }),
	onLoginDetected: () => ({ type: 'stubhub_login_detected' }),
};

export { stubhubInterceptorConfig } from './config';
export { StubHubInterceptor } from './interceptor';
export { routes } from './routes';
