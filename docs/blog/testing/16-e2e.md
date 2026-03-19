# Forty-Four Commits Later

I ran `git log --oneline | grep -i e2e` on our other project and counted. Fifty-five commits with "e2e" or "playwright" in the message. Forty-five of them were fixes.

Eighty-two percent. For every commit that added a test, four more commits fixed the infrastructure around it.

I was about to add Playwright to a new project. Same team, same stack (Next.js, Auth.js, pnpm monorepo), similar dashboard. I decided to read all forty-five fix commits before writing a single test.

---

The first commit message that stopped me was `fix: make paper-trading E2E test more robust for CI`. The fix was switching to `waitForLoadState('networkidle')`. Reasonable — wait for all network activity to settle before asserting. Every Playwright tutorial recommends it.

Three commits later: `fix(e2e): remove networkidle wait - SSE prevents it from resolving`.

The dashboard streams real-time data over Server-Sent Events. SSE keeps an HTTP connection open permanently. `networkidle` waits for all connections to close. It never fires. The "robust" fix became the next bug.

I wrote this in my notes: *Never use networkidle. Wait for the element you're actually testing.*

---

The second pattern was subtler. Commit `fix(e2e): prevent HTML reporter from blocking CI on test failure`. The description: "Playwright's HTML reporter defaults to `open: 'on-failure'`, which starts a web server and waits for user input when tests fail."

In CI, there's no user. The web server starts, waits for someone to look at it, and the pipeline hangs forever. Not a failure — a hang. The test results were right there, but the reporter was blocking the process from exiting.

The fix is one line in the config:

```typescript
reporter: IS_CI ? "list" : [["html", { open: "never" }]],
```

`'list'` in CI, HTML with `open: 'never'` locally. I added this before writing my first test.

---

The third one was about login. Commit `perf(e2e): use storageState for auth to reduce login overhead`. The message: "Reduces E2E runtime from ~2.6min to ~20s by eliminating 10+ logins."

Every test was logging in. Navigate to `/login`, fill email, fill password, click submit, wait for redirect, wait for dashboard. Multiply that by twelve tests. The overhead dominated the actual assertions.

Playwright has a feature called `storageState`. You log in once in a setup project, save the cookies to a JSON file, and every subsequent test loads those cookies instead of going through the login flow. The tests start already authenticated.

```typescript
// auth.setup.ts — runs once
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@deep-research.dev");
  await page.getByLabel("Password").fill("Admin123!");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("**/dashboard", { timeout: 30_000 });
  await page.context().storageState({ path: "tests/e2e/.auth/user.json" });
});
```

Then in the config:

```typescript
projects: [
  { name: "setup", testMatch: /.*\.setup\.ts/ },
  {
    name: "chromium",
    use: { storageState: "tests/e2e/.auth/user.json" },
    dependencies: ["setup"],
  },
]
```

The `dependencies` key ensures setup runs first. Every test in the "chromium" project starts with valid session cookies. Login happens once per suite, not once per test.

---

The fourth pattern was about ports. Commit `fix(testing): resolve Vitest/Playwright race condition and improve logging`. Vitest runs unit tests. Playwright runs E2E tests. Both try to start a dev server. If they use the same port, one hangs waiting for the other to release it.

The fix: dedicate a port to E2E.

```typescript
const E2E_PORT = 3002;
```

Dev runs on 3000. Vitest doesn't need a server. E2E owns 3002. No collisions.

And a related commit: `fix(e2e): suppress spurious errors and fix test selectors`. The relevant part: "Fix playwright.config to use `port` instead of `url` (prevents hanging)."

Playwright's `webServer` config has two readiness options: `url` (fetch the URL and wait for 200) and `port` (wait for the port to accept connections). The `url` option sounds better — it verifies the server actually responds. But Next.js serves a 200 on `/_next/` static paths before the app is ready. With `port`, Playwright waits for the TCP socket, which lines up with when the dev server is actually accepting requests.

---

The fifth pattern showed up across seven consecutive commits. All variations of the same theme: tests for pages that no longer exist.

```
fix(e2e): delete divergence-signals test (tests non-existent pages)
fix(e2e): remove strategies test and fix flow-regime test
fix(e2e): update admin tests for existing pages (jobs/schedules)
fix(e2e): update navigation and flow-regime tests for current routes
fix(e2e): rewrite tests for current app structure after refactor
fix(e2e): rewrite trading-dashboard tests for sessions page
fix(e2e): handle session pause race and missing cluster_id column
```

The app refactored faster than the tests. Pages renamed, routes deleted, navigation restructured. The E2E suite kept testing ghosts. Each commit was someone discovering another test that asserted elements on a page that had been removed two weeks earlier.

This one doesn't have a config fix. It's a process lesson: when you delete a page, delete its tests in the same commit.

---

The sixth pattern was the saddest. Two commits, a day apart:

```
fix(e2e): increase terminal-audit test timeout to 120s
fix(e2e): skip terminal-audit in CI -- visual audit tool exceeds timeout
```

The test visited 8 tabs with navigation delays. It exceeded the 30-second default. So someone quadrupled the timeout to 120 seconds. It still failed in CI. So they skipped it entirely.

The lesson: if a test needs 120 seconds, it's not an E2E test. It's a visual audit. Keep it for local use. Don't pretend it belongs in CI.

---

I kept reading. The env var that didn't propagate through `webServer.env`. The Robinhood auth state that doesn't exist in CI. The test fixtures that lived in a gitignored directory — passed locally, failed in CI because the files were never committed.

By commit forty-five, the picture was clear. I organized the lessons into a config:

```typescript
export default defineConfig({
  reporter: IS_CI ? "list" : [["html", { open: "never" }]],
  timeout: 30_000,
  globalTimeout: IS_CI ? 10 * 60 * 1000 : 5 * 60 * 1000,
  webServer: {
    port: E2E_PORT, // not url
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
    env: { ...process.env, AUTH_SECRET: "...", AUTH_URL: "..." },
  },
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: { storageState: "tests/e2e/.auth/user.json" },
      dependencies: ["setup"],
    },
    {
      name: "auth-tests",
      testMatch: [/auth\.spec\.ts/],
    },
  ],
});
```

Every line traces back to a specific fix commit. `stdout: "ignore"` prevents buffer blocking. `globalTimeout` prevents infinite hangs. Three projects separate authenticated tests from auth-flow tests from setup. The `env` block ensures `AUTH_SECRET` reaches the Next.js dev server.

Twelve tests. Auth flows, dashboard assertions, sign-out, protected routes. All passing on the first `npx playwright test`.

---

Except not quite.

The first surprise was a selector. The login page has a "Sign In" title rendered by shadcn's `CardTitle` component. I wrote:

```typescript
await expect(
  page.getByRole("heading", { name: "Sign In" })
).toBeVisible();
```

It failed. `CardTitle` renders a `<div>`, not an `<h>` element. `getByRole("heading")` doesn't find it because it's not a heading. The fix:

```typescript
await expect(
  page.getByText("Sign In", { exact: true }).first()
).toBeVisible();
```

The `.first()` is because "Sign In" appears both in the card title and as a link in the footer. Strict mode catches the ambiguity.

The second surprise was a stale process. Port 3002 was occupied by a dev server from a previous session. Playwright's webServer tried to start, failed silently (because `reuseExistingServer` was true locally), and connected to the wrong server instance. The tests hit pages with stale code.

The fix was adding a cleanup step to the CI script:

```bash
lsof -ti:3002 | xargs kill 2>/dev/null || true
```

The third surprise was `npx` vs `pnpm exec`. The `playwright` binary wasn't in pnpm's PATH resolution for the root workspace. `pnpm exec playwright test` failed with a permissions error. `npx playwright test` worked. One line in `package.json`:

```json
"e2e": "npx playwright test"
```

Three surprises. All fixed in place, not in follow-up commits.

---

Forty-five fix commits compressed into three gotchas. That's the math. Not because I'm better at Playwright than the person who wrote those forty-five commits. I am that person. Same developer, same stack, same mistakes available to make. The difference is reading the git log first.

A git log is not a changelog. It's a decision record. Every fix commit says: "I assumed X, and X was wrong." Reading forty-five of them back-to-back builds a map of wrong assumptions. `networkidle` assumes connections close. `url` readiness assumes HTTP 200 means ready. `getByRole("heading")` assumes UI components render semantic HTML.

When you start a second project with the same stack, you don't need to be smarter. You need to read what you already learned.

The forty-fifth commit was `fix: e2e detail page timeout, navigation heading, remove flaky assertions`. The forty-sixth was nothing. The tests just worked.
