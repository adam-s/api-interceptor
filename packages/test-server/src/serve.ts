// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
/**
 * Standalone server entry point — run with `tsx src/serve.ts` or `pnpm dev`.
 */

import { createTestServer } from './index.js';

const port = Number(process.env.TEST_SERVER_PORT) || 4444;

const server = await createTestServer({ port });
console.log(`Test server running at ${server.url}`);
console.log(`Health: ${server.url}/health`);
console.log(`Endpoints: ${server.url}/`);

// Graceful shutdown
process.on('SIGINT', async () => {
	await server.close();
	process.exit(0);
});
