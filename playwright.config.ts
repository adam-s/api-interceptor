import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 3002;
const IS_CI = !!process.env.CI;

export default defineConfig({
	testDir: "./tests/e2e",
	fullyParallel: true,
	forbidOnly: IS_CI,
	retries: IS_CI ? 2 : 0,
	workers: IS_CI ? 1 : 2,
	// CRITICAL: HTML reporter blocks on failure (opens web server). Use 'list' in CI.
	reporter: IS_CI ? "list" : [["html", { open: "never" }]],
	timeout: 30_000,
	globalTimeout: IS_CI ? 10 * 60 * 1000 : 5 * 60 * 1000,

	expect: {
		timeout: 10_000,
	},

	use: {
		baseURL: `http://localhost:${E2E_PORT}`,
		trace: "on-first-retry",
		actionTimeout: 15_000,
	},

	projects: [
		// Setup project — authenticates once and saves session state
		{
			name: "setup",
			testMatch: /.*\.setup\.ts/,
		},
		// Dashboard/authenticated tests — use saved auth state
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				storageState: "tests/e2e/.auth/user.json",
			},
			dependencies: ["setup"],
			testIgnore: [/.*\.setup\.ts/, /auth\.spec\.ts/],
		},
		// Auth tests — run WITHOUT storageState (tests login/register flow)
		{
			name: "auth-tests",
			use: { ...devices["Desktop Chrome"] },
			testMatch: [/auth\.spec\.ts/],
		},
	],

	// Single webServer — Next.js handles both pages and API routes
	// IMPORTANT: Use `port` not `url` for readiness check — `url` can hang
	webServer: {
		command: `pnpm --filter @volat/web dev --port ${E2E_PORT}`,
		port: E2E_PORT,
		reuseExistingServer: !IS_CI,
		timeout: 120_000, // Next.js cold start can be slow
		stdout: "ignore", // Prevent buffer blocking
		stderr: "pipe",
		env: {
			...process.env,
			AUTH_SECRET:
				process.env.AUTH_SECRET || "e2e-test-secret-deep-research",
			AUTH_URL: `http://localhost:${E2E_PORT}`,
		},
	},
});
