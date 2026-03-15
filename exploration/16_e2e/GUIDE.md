# A Complete Guide to Playwright E2E Testing with Next.js and Auth.js

Adding end-to-end tests to a Next.js app with authentication requires solving a specific set of problems: session persistence across tests, SSE connections that never close, cold-start compilation delays, and environment variable propagation through Playwright's webServer. Here's a working setup with every decision explained.

```
playwright.config.ts
tests/e2e/
  .auth/user.json          # saved session (gitignored)
  auth.setup.ts             # login once, save cookies
  auth.spec.ts              # login/register/redirect tests
  dashboard.spec.ts         # authenticated page tests
```

This config produces 12 passing tests in under 30 seconds, authenticating once instead of per-test.

## Table of Contents

- [Project Architecture](#project-architecture)
  - [Three Projects, One Config](#three-projects-one-config)
  - [Why Three Projects](#why-three-projects)
- [The Config File](#the-config-file)
  - [Reporter](#reporter)
  - [Timeouts](#timeouts)
  - [webServer](#webserver)
- [Authentication Setup](#authentication-setup)
  - [The Setup Project](#the-setup-project)
  - [storageState](#storagestate)
  - [Auth Flow Tests (Without storageState)](#auth-flow-tests-without-storagestate)
- [Writing Tests](#writing-tests)
  - [Selector Strategy](#selector-strategy)
  - [SSE and networkidle](#sse-and-networkidle)
  - [Cold Start Timeouts](#cold-start-timeouts)
  - [The CardTitle Trap](#the-cardtitle-trap)
- [Auth.js Error Handling](#authjs-error-handling)
  - [The NEXT_REDIRECT Problem](#the-next_redirect-problem)
  - [Inline Error Display](#inline-error-display)
- [CI Integration](#ci-integration)
  - [Port Isolation](#port-isolation)
  - [Stale Process Cleanup](#stale-process-cleanup)
  - [Local CI Script](#local-ci-script)
- [Common Patterns](#common-patterns)
- [Gotchas](#gotchas)

---

## Project Architecture

### Three Projects, One Config

Playwright "projects" are independent test configurations that run in sequence or parallel. For an authenticated app, you need three:

```typescript
projects: [
  // 1. Setup — log in once, save cookies
  {
    name: "setup",
    testMatch: /.*\.setup\.ts/,
  },
  // 2. Authenticated tests — reuse saved cookies
  {
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      storageState: "tests/e2e/.auth/user.json",
    },
    dependencies: ["setup"],
    testIgnore: [/.*\.setup\.ts/, /auth\.spec\.ts/],
  },
  // 3. Auth flow tests — no cookies, tests login/register UI
  {
    name: "auth-tests",
    use: { ...devices["Desktop Chrome"] },
    testMatch: [/auth\.spec\.ts/],
  },
],
```

### Why Three Projects

**Setup** runs first because of `dependencies: ["setup"]` on the chromium project. It performs one real login, saves the session cookies to disk.

**Chromium** runs every test *except* the auth flow tests. Each test starts with valid cookies — no login needed. This is where dashboard tests, settings tests, and any page behind auth live. On a previous project, this single change cut the suite from 2.6 minutes to 20 seconds by eliminating 10+ redundant logins.

**Auth-tests** runs *without* storageState. These tests verify the login form, registration form, error handling, and redirect behavior. They need to start unauthenticated.

---

## The Config File

Here's the full config. Every line with a comment traces back to a real bug.

```typescript
import { defineConfig, devices } from "@playwright/test";

const E2E_PORT = 3002;
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 1 : 2,
  reporter: IS_CI ? "list" : [["html", { open: "never" }]],
  timeout: 30_000,
  globalTimeout: IS_CI ? 10 * 60 * 1000 : 5 * 60 * 1000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: "on-first-retry",
    actionTimeout: 15_000,
  },
  projects: [/* ... as above ... */],
  webServer: {
    command: `pnpm --filter @volat/web dev --port ${E2E_PORT}`,
    port: E2E_PORT,
    reuseExistingServer: !IS_CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      ...process.env,
      AUTH_SECRET: process.env.AUTH_SECRET || "e2e-test-secret",
      AUTH_URL: `http://localhost:${E2E_PORT}`,
    },
  },
});
```

### Reporter

```typescript
reporter: IS_CI ? "list" : [["html", { open: "never" }]],
```

Playwright's HTML reporter defaults to `open: 'on-failure'`. When tests fail in CI, it starts a web server to display the report and waits for user input. In a headless environment, the pipeline hangs forever. Not a failure — a hang. CI logs show the tests completed, but the process never exits.

Use `'list'` in CI for simple stdout output. Use `[["html", { open: "never" }]]` locally — you get the report file without the blocking behavior.

### Timeouts

Four timeout layers, each catching a different failure mode:

```typescript
timeout: 30_000,          // per-test timeout
globalTimeout: IS_CI      // entire suite timeout
  ? 10 * 60 * 1000       // 10 min in CI
  : 5 * 60 * 1000,       // 5 min local
expect: { timeout: 10_000 },  // per-assertion timeout
actionTimeout: 15_000,    // per-action (click, fill) timeout
```

| Timeout | What it catches |
|---------|----------------|
| `timeout` | A single test hanging (bad selector, unresolved promise) |
| `globalTimeout` | The entire suite hanging (webServer never starts, deadlock) |
| `expect.timeout` | A slow assertion (element appears after React hydration) |
| `actionTimeout` | A blocked action (button behind overlay, disabled input) |

Without `globalTimeout`, a broken webServer config causes the suite to wait indefinitely. A previous project discovered this when a Vitest/Playwright port collision left both tools waiting for each other.

### webServer

```typescript
webServer: {
  command: `pnpm --filter @volat/web dev --port ${E2E_PORT}`,
  port: E2E_PORT,           // NOT url
  reuseExistingServer: !IS_CI,
  timeout: 120_000,         // Next.js cold start
  stdout: "ignore",         // prevent buffer blocking
  stderr: "pipe",           // keep error output visible
  env: {
    ...process.env,
    AUTH_SECRET: process.env.AUTH_SECRET || "e2e-test-secret",
    AUTH_URL: `http://localhost:${E2E_PORT}`,
  },
},
```

**`port` vs `url`**: Playwright offers two readiness checks. `url` fetches a URL and waits for HTTP 200. `port` waits for the TCP port to accept connections. Use `port`. Next.js returns 200 on static paths before the app is actually ready, and some configurations cause `url` to hang entirely.

**`stdout: "ignore"`**: Next.js dev mode produces a lot of output. If Playwright buffers it (the default), the buffer can fill and block the child process. Ignoring stdout prevents this. Keep `stderr: "pipe"` so compilation errors are still visible.

**`timeout: 120_000`**: Next.js compiles pages on first request in dev mode. The first test triggers compilation of the login page, the dashboard page, and any layouts. On a cold start (no `.next` cache), this takes 30-60 seconds. The default 60-second webServer timeout isn't enough.

**`env`**: Auth.js needs `AUTH_SECRET` and `AUTH_URL` to function. In a monorepo, `.env` lives at the project root, but Next.js loads `.env` from the app directory. Passing these through `webServer.env` ensures they reach the dev server regardless of working directory.

> **Gotcha**: Use `...process.env` as the base, then override specific values. Without spreading the parent env, the child process loses `PATH`, `HOME`, and everything else.

---

## Authentication Setup

### The Setup Project

```typescript
// tests/e2e/auth.setup.ts
import { expect, test as setup } from "@playwright/test";

const authFile = "tests/e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@deep-research.dev");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: /sign in/i }).click();

  try {
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
  } catch {
    await page.screenshot({ path: "test-results/auth-debug.png" });
    throw new Error(`Login failed — still on ${page.url()} after 30s`);
  }

  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible({ timeout: 60_000 });

  await page.context().storageState({ path: authFile });
});
```

The `try/catch` around `waitForURL` captures a screenshot on failure. When auth fails, you need to see what the page actually shows — is it an error message? A loading spinner? A blank screen? The screenshot tells you.

The 60-second heading timeout covers Next.js cold-start compilation. The dashboard page, its layout, and all imported components compile on first visit.

### storageState

`storageState` serializes cookies and localStorage to a JSON file. When another project loads it, Playwright injects these values before any navigation. The browser starts with a valid session.

```
tests/e2e/.auth/user.json   ← contains session cookies
```

Add this directory to `.gitignore`:

```
tests/e2e/.auth/
```

The file is regenerated on every test run. Committing it would leak session tokens.

### Auth Flow Tests (Without storageState)

Auth flow tests must start unauthenticated. The "auth-tests" project omits `storageState`:

```typescript
{
  name: "auth-tests",
  use: { ...devices["Desktop Chrome"] },  // no storageState
  testMatch: [/auth\.spec\.ts/],
},
```

For the sign-out test specifically, clear any existing state:

```typescript
test.describe("Sign out flow", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("user can sign out from dashboard", async ({ page }) => {
    // Log in manually within the test
    await page.goto("/login");
    // ... fill and submit ...
    await page.waitForURL("**/dashboard", { timeout: 30_000 });

    // Click user email to open dropdown
    await page.getByText("admin@deep-research.dev").first().click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});
```

> **Gotcha**: `.first()` is needed on the user email because it appears both in the sidebar trigger and the dropdown content. Playwright's strict mode rejects ambiguous matches.

---

## Writing Tests

### Selector Strategy

No `data-testid` attributes? Use accessible selectors. They're resilient to refactors and test what users actually see.

| Pattern | Selector |
|---------|----------|
| Form input with label | `page.getByLabel("Email")` |
| Button with text | `page.getByRole("button", { name: /sign in/i })` |
| Heading | `page.getByRole("heading", { name: "Dashboard" })` |
| Link | `page.getByRole("link", { name: /register/i })` |
| Visible text | `page.getByText("SSE streaming + Python bridge integration")` |
| Dropdown item | `page.getByRole("menuitem", { name: /sign out/i })` |

Prefer `getByRole` over `getByText` when the element has a semantic role. Use `{ exact: true }` to avoid substring matches. Use `.first()` when text appears multiple times.

### SSE and networkidle

If your app uses Server-Sent Events, **never use `waitForLoadState('networkidle')`**. SSE keeps a persistent HTTP connection open. The network never goes idle. The wait never resolves.

```typescript
// BROKEN — hangs forever with SSE
await page.waitForLoadState("networkidle");

// WORKS — wait for what you're actually testing
await expect(
  page.getByRole("heading", { name: "Dashboard", exact: true }),
).toBeVisible({ timeout: 30_000 });
```

Use element-based waits everywhere. Wait for the heading, the button, the table row — the thing you're about to assert. This is faster, more specific, and immune to background connections.

In the dashboard test suite, use `beforeEach` with a heading wait instead of `networkidle`:

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
});
```

### Cold Start Timeouts

Next.js dev mode compiles pages on demand. The first test to hit a page triggers compilation. Budget 60 seconds for the first heading assertion on any page:

```typescript
await expect(
  page.getByRole("heading", { name: "Dashboard", exact: true }),
).toBeVisible({ timeout: 60_000 });
```

Subsequent navigations to the same page are instant because the compiled output is cached in `.next`. Only the first visit is slow.

### The CardTitle Trap

shadcn/ui's `CardTitle` component renders a `<div>`, not an `<h1>` through `<h6>`. This means `getByRole("heading")` won't find it.

```typescript
// FAILS — CardTitle is a <div>, not a heading
await expect(
  page.getByRole("heading", { name: "Sign In" })
).toBeVisible();

// WORKS — match by text content instead
await expect(
  page.getByText("Sign In", { exact: true }).first()
).toBeVisible();
```

The `.first()` is needed because "Sign In" might appear as both a card title and a link elsewhere on the page. Playwright's strict mode throws if `getByText` matches multiple elements.

This applies to any UI library where "title" components don't use heading elements. Check the rendered HTML — don't assume semantic markup.

---

## Auth.js Error Handling

### The NEXT_REDIRECT Problem

Auth.js v5's `signIn()` function doesn't return on success. It throws a `NEXT_REDIRECT` exception that Next.js catches internally to perform the redirect. If you wrap `signIn()` in a generic try/catch, you swallow the redirect and the user stays on the login page after a successful login.

```typescript
// BROKEN — catches the redirect along with the error
try {
  await signIn("credentials", { redirectTo: "/dashboard" });
} catch (error) {
  return { error: "Invalid credentials" };
}
```

### Inline Error Display

The fix: catch `AuthError` specifically and re-throw everything else.

```typescript
import { AuthError } from "next-auth";

export async function login(_prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    throw error; // re-throws NEXT_REDIRECT
  }
}
```

`AuthError` covers `CredentialsSignin` and other auth failures. `NEXT_REDIRECT` is not an `AuthError`, so it gets re-thrown and Next.js handles the redirect normally.

Without this fix, your "wrong credentials" E2E test has nothing to assert — the error never reaches the UI.

---

## CI Integration

### Port Isolation

Dedicate a port for E2E that doesn't conflict with development (3000) or other test suites:

```typescript
const E2E_PORT = 3002;
```

| Context | Port |
|---------|------|
| Dev server | 3000 |
| API server | 3001 |
| E2E tests | 3002 |

### Stale Process Cleanup

A common CI failure: port 3002 is occupied by a process from a previous run. The webServer can't start, and if `reuseExistingServer` is true (local mode), Playwright connects to the stale server.

```bash
lsof -ti:3002 | xargs kill 2>/dev/null || true
sleep 1
```

Add this before running Playwright in any CI or local script.

### Local CI Script

A complete E2E step for a local CI script:

```bash
step "E2E tests (Playwright)"
docker compose up -d postgres
sleep 3
(cd packages/db && pnpm run setup && pnpm run seed) 2>/dev/null
lsof -ti:3002 | xargs kill 2>/dev/null || true
sleep 1
PLAYWRIGHT_HTML_OPEN=never npx playwright test || fail "E2E tests failed"
pass "E2E tests"
```

The sequence: ensure the database is running, apply migrations and seed data, kill any stale process on the E2E port, run the tests. `PLAYWRIGHT_HTML_OPEN=never` is a belt-and-suspenders guard against the reporter blocking issue.

---

## Common Patterns

### Protected Route Redirect

```typescript
test("unauthenticated access redirects to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: /sign in/i }),
  ).toBeVisible();
});
```

### Form Validation Error

```typescript
test("shows error for wrong credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("wrong@email.com");
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(
    page.getByText(/invalid email or password/i)
  ).toBeVisible({ timeout: 10_000 });
});
```

### Full Login Flow

```typescript
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
```

### SSE Component Test

```typescript
test("multiplier panel is visible", async ({ page }) => {
  // SSE component shows "Connecting..." until EventSource connects
  await expect(
    page.getByText("Connecting...").or(page.getByText("Count")),
  ).toBeVisible({ timeout: 15_000 });
});
```

The `.or()` pattern handles the race between the loading state and the connected state. Either is valid — the test just needs the component to have rendered.

### Sign Out Flow

```typescript
test("user can sign out from dashboard", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  // Login
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@deep-research.dev");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });

  // Open user menu
  const userButton = page.getByText("admin@deep-research.dev").first();
  await expect(userButton).toBeVisible({ timeout: 10_000 });
  await userButton.click();

  // Sign out
  const signOutItem = page.getByRole("menuitem", { name: /sign out/i });
  await expect(signOutItem).toBeVisible({ timeout: 5_000 });
  await signOutItem.click();

  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
});
```

The large viewport ensures the sidebar is expanded (collapsed sidebars may hide the user email behind a hamburger menu). `.first()` on the user email avoids strict mode violations from duplicate text in trigger and dropdown.

---

## Gotchas

| Gotcha | Symptom | Fix |
|--------|---------|-----|
| HTML reporter blocks CI | Pipeline hangs after test completion | `reporter: IS_CI ? "list" : [["html", { open: "never" }]]` |
| `networkidle` with SSE | Tests hang waiting for idle | Use element selectors, never `networkidle` |
| `url` readiness check | webServer hangs or reports ready too early | Use `port` instead of `url` |
| `stdout: "pipe"` buffer full | Dev server blocks, tests timeout | `stdout: "ignore"`, keep `stderr: "pipe"` |
| CardTitle is a `<div>` | `getByRole("heading")` fails | Use `getByText("Title", { exact: true }).first()` |
| Cold start timeout | First test fails, rest pass | Budget 60s for first heading assertion |
| ENV vars not reaching Next.js | Auth fails in tests (`MissingSecret`) | Pass via `webServer.env` |
| Stale process on port | Tests hit old server, wrong behavior | `lsof -ti:PORT \| xargs kill` before test run |
| Session cookies in git | Security risk | Add `tests/e2e/.auth/` to `.gitignore` |
| Duplicate text matches | Strict mode error | Add `.first()` or use more specific selector |
| `signIn()` error swallowed | No error UI, redirect stops working | Catch `AuthError` specifically, re-throw rest |
| Tests for deleted pages | Consistent timeout failures | Delete tests in same commit as page removal |

---

*Last updated: February 2026. Next.js 16, Auth.js v5, Playwright 1.52+, shadcn/ui with Tailwind v4.*
