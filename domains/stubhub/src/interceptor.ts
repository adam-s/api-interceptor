import { GenericInterceptor } from '@interceptor/browser/shared/interceptor';
import { stubhubInterceptorConfig } from './config';

export class StubHubInterceptor extends GenericInterceptor {
	constructor() {
		super(stubhubInterceptorConfig);
	}
}
