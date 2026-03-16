import { expect, test } from '@playwright/test';

test.describe('Dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/dashboard');
		// Wait for dashboard heading — NOT networkidle (SSE keeps connection open)
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible({
			timeout: 30_000,
		});
	});

	test('shows dashboard heading and description', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
		await expect(page.getByText('WebSocket streaming + Python bridge integration.')).toBeVisible();
	});

	test('sidebar is visible with branding', async ({ page }) => {
		await expect(page.getByText('Interceptor').first()).toBeVisible();
		await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
	});

	test('multiplier panel is visible', async ({ page }) => {
		// MultiplierPanel shows "Connecting..." until SSE connects, then renders controls
		await expect(page.getByText('Connecting...').or(page.getByText('Count'))).toBeVisible({
			timeout: 15_000,
		});
	});
});
