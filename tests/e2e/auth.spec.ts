import { expect, test } from "@playwright/test";

test.describe("Authentication", () => {
	test.describe("Protected Route Redirection", () => {
		test("unauthenticated access to /dashboard redirects to /login", async ({
			page,
		}) => {
			await page.goto("/dashboard");
			// (dashboard)/layout.tsx calls auth(), redirects to /login if null
			await expect(page).toHaveURL(/\/login/);
			await expect(
				page.getByRole("button", { name: /sign in/i }),
			).toBeVisible();
		});
	});

	test("login page renders correctly", async ({ page }) => {
		await page.goto("/login");
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByLabel("Password")).toBeVisible();
		await expect(
			page.getByRole("button", { name: /sign in/i }),
		).toBeVisible();
		// CardTitle renders as a div, not a heading element
		await expect(page.getByText("Sign In", { exact: true }).first()).toBeVisible();
		await expect(page.getByRole("link", { name: /register/i })).toBeVisible();
	});

	test("shows error for wrong credentials", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("Email").fill("wrong@email.com");
		await page.getByLabel("Password").fill("wrongpassword");
		await page.getByRole("button", { name: /sign in/i }).click();

		// Server action catches AuthError and returns inline error
		await expect(page.getByText(/invalid email or password/i)).toBeVisible({
			timeout: 10_000,
		});
	});

	test("successful login redirects to /dashboard", async ({ page }) => {
		await page.goto("/login");
		await page.getByLabel("Email").fill("admin@deep-research.dev");
		await page.getByLabel("Password").fill("Admin123!");
		await page.getByRole("button", { name: /sign in/i }).click();

		await page.waitForURL("**/dashboard", { timeout: 30_000 });
		await expect(
			page.getByRole("heading", { name: "Dashboard", exact: true }),
		).toBeVisible({ timeout: 60_000 });
	});

	test("register page renders correctly", async ({ page }) => {
		await page.goto("/register");
		// CardTitle renders as a div, not a heading element
		await expect(page.getByText("Create Account", { exact: true }).first()).toBeVisible();
		await expect(page.getByLabel("Name")).toBeVisible();
		await expect(page.getByLabel("Email")).toBeVisible();
		await expect(page.getByLabel(/^password$/i)).toBeVisible();
		await expect(page.getByLabel(/confirm password/i)).toBeVisible();
		await expect(
			page.getByRole("button", { name: /create account/i }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
	});

	test("landing page has sign in and register links", async ({ page }) => {
		await page.goto("/");
		await expect(
			page.getByRole("heading", { name: "Deep Research" }),
		).toBeVisible();
		await expect(page.getByRole("link", { name: /sign in/i })).toBeVisible();
		await expect(
			page.getByRole("link", { name: /register/i }),
		).toBeVisible();
	});

	test.describe("Sign out flow", () => {
		// Clear any existing storage state
		test.use({ storageState: { cookies: [], origins: [] } });

		test("user can sign out from dashboard", async ({ page }) => {
			// Large viewport ensures sidebar is expanded
			await page.setViewportSize({ width: 1920, height: 1080 });

			// Login first
			await page.goto("/login");
			await page.getByLabel("Email").fill("admin@deep-research.dev");
			await page.getByLabel("Password").fill("Admin123!");
			await page.getByRole("button", { name: /sign in/i }).click();
			await page.waitForURL("**/dashboard", { timeout: 30_000 });
			await expect(
				page.getByRole("heading", { name: "Dashboard", exact: true }),
			).toBeVisible({ timeout: 60_000 });

			// Click user email in sidebar to open dropdown
			const userButton = page
				.getByText("admin@deep-research.dev")
				.first();
			await expect(userButton).toBeVisible({ timeout: 10_000 });
			await userButton.click();

			// Click "Sign Out" in the dropdown
			const signOutItem = page.getByRole("menuitem", {
				name: /sign out/i,
			});
			await expect(signOutItem).toBeVisible({ timeout: 5_000 });
			await signOutItem.click();

			// signOut({ callbackUrl: "/login" }) redirects to /login
			await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
			await expect(
				page.getByRole("button", { name: /sign in/i }),
			).toBeVisible();
		});
	});
});
