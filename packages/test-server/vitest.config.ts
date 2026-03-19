import { defineProject } from 'vitest/config';

export default defineProject({
	test: {
		name: 'test-server',
		include: ['src/**/*.test.ts'],
		testTimeout: 15000, // SSE/WS tests need longer timeouts
	},
});
