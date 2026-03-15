import { expect, test as setup } from "@playwright/test";

const authFile = "tests/e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
	await page.goto("/login");
	await page.getByLabel("Email").fill("admin@example.com");
	await page.getByLabel("Password").fill("Admin123!");
	await page.getByRole("button", { name: /sign in/i }).click();

	// Wait for redirect away from /login — handles slow cold-start compilation
	try {
		await page.waitForURL("**/dashboard", { timeout: 30_000 });
	} catch {
		await page.screenshot({ path: "test-results/auth-debug.png" });
		throw new Error(`Login failed — still on ${page.url()} after 30s`);
	}

	// Wait for dashboard heading — needs long timeout on cold start
	// because Next.js compiles the dashboard page on first request
	await expect(
		page.getByRole("heading", { name: "Dashboard", exact: true }),
	).toBeVisible({ timeout: 60_000 });

	await page.context().storageState({ path: authFile });
});
