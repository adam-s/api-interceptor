---
name: visual-dev
description: Visual development with Playwright screenshots. Use when building, fixing, or reviewing UI — takes screenshots, analyzes layout and functionality, iterates until correct, then cleans up.
---

# Visual Development Loop

Use Playwright as a development tool to see the UI, verify interactions, and improve visual quality through an iterative screenshot loop.

**The core principle**: Understand first, then verify. Read the code before taking screenshots. Form expectations before clicking buttons. Every screenshot should confirm or deny a specific hypothesis — never "let's see what happens."

## Prerequisites

### 1. Discover the running server

```bash
lsof -iTCP -sTCP:LISTEN -P 2>/dev/null | grep -E ':(3000|3001|3002|3003|4000|5173|8080)\s'
```

**CRITICAL**: Multiple projects often share the same ports. Another project's server may be squatting on the expected port from earlier work. You MUST `curl` every candidate port and verify the HTML title matches this project before setting `BASE_URL`:

```bash
curl -s http://localhost:3000 | head -20  # look for the right <title> or HTML
curl -s http://localhost:3002 | head -20  # check other ports too
```

Do NOT write the Playwright script until you've confirmed the correct port. A wrong port causes a `goto` timeout that wastes 15-30 seconds.

If no server is running, check `package.json` for the dev command (`pnpm dev`, `npm run dev`, `bun dev`, etc.). Set `BASE_URL` to whichever port you confirmed.

### 2. Discover auth credentials AND post-login redirect

Search in this order:

1. `CLAUDE.md` or project README
2. Existing e2e tests — `grep -r 'fill.*password\|fill.*email' tests/ e2e/`
3. Seed files — `prisma/seed.ts`, `drizzle/seed.ts`, `scripts/seed*`
4. Environment files — `.env.test`, `.env.local`

**Also extract the post-login redirect URL** from the same source. E2e auth setup files typically contain a `waitForURL` that reveals where login redirects to (e.g., `**/dashboard`, `**/`, `**/app`). You need this for the `waitForURL` call in your script — don't guess or hardcode `**/dashboard**`.

> **Example** (deep-research project): `tests/e2e/auth.setup.ts` has credentials `admin@deep-research.dev` / `Admin123!` AND reveals the redirect target: `waitForURL("**/dashboard")`.

### 3. Create the screenshot directory

```bash
mkdir -p test-results/dev-screenshots
```

Verify this path is gitignored. If not, use another gitignored temp directory.

## Step 0: Understand the Application

**Do this before writing any Playwright script.** Read the source code to build a mental model of the app. Screenshots without understanding lead to surface-level fixes that miss structural problems.

### Start from the URL, not the file tree

Don't glob the entire codebase. Start from the specific page you're about to screenshot and work outward:

1. **Find the route file** for the URL you'll visit. Search for the path segment:
   - `Grep "dashboard" --glob "**/page.tsx"` or `Grep "dashboard" --glob "**/route.*"`
   - Frameworks vary: Next.js uses `app/` dirs, React Router uses route configs, Remix uses `routes/`, etc. Let the search find it.

2. **Read the page component.** Identify what it renders — follow its imports one level deep:
   - What child components does it mount?
   - Does it fetch data server-side (server component, loader, `getServerSideProps`)?
   - Does it wrap children in providers (auth, theme, sidebar)?

3. **Read each significant child component.** For each one:
   - What data does it consume? (props, hooks, context, direct fetches)
   - What interactive elements does it expose? (buttons, forms, toggles, links)
   - Does it subscribe to external state? (SSE `EventSource`, WebSocket, polling, React Query)

4. **Trace data dependencies one more level** when they involve network:
   - If a component calls `fetch("/api/something")`, find that API route and read it
   - If the API delegates to a backend service (Python worker, queue, DB), note what it does — this tells you what the data *means* and how long it takes

The goal is a mental chain: **URL → page → components → data sources → backend**. You don't need every file — just enough to know what each visible element represents and how interactions flow through the system.

> **Example**: Tracing `/dashboard` might reveal: page renders `<StatsPanel>` → component subscribes to `EventSource("/api/events")` for live data + `POST /api/actions` for button clicks → API route delegates to a Python bridge for computation. Now you know: buttons trigger API calls, live data arrives via SSE, stats depend on a backend process being healthy, and there's a ~1s delay between click and visual update.

### Form expectations before screenshotting

Based on the code you just read, predict what you'll see and how interactions should behave:

- What elements should be visible on initial load?
- What should happen when each button/form is used? (state change, API call, visual update)
- How long until results appear? (instant for local state, ~1s for API, variable for SSE)
- At wide viewports, should content be constrained or fill the screen?

These expectations become your verification criteria. When a screenshot doesn't match, you already know where in the stack to look — is it a rendering issue (component), a data issue (hook/API), or a backend issue (service)?

## Step 1: Write a Temporary Playwright Script

Create `test-results/dev-screenshots/check.ts`. Use Playwright's **library API** (`chromium.launch`), not the test runner.

### Template: Unauthenticated Pages

```typescript
import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:XXXX"; // <-- from prerequisite

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  // Always wait for a specific element — never rely on networkidle
  await page.getByLabel("Email").waitFor({ timeout: 10_000 });

  await page.screenshot({
    path: "test-results/dev-screenshots/login-desktop.png",
    fullPage: true,
  });

  await browser.close();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Template: Authenticated Pages

```typescript
import { chromium } from "@playwright/test";

const BASE_URL = "http://localhost:XXXX"; // <-- from prerequisite

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();

  // Always manual login — storageState files from prior e2e runs go stale
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await page.getByLabel("Email").fill("DISCOVERED_EMAIL");    // <-- from prerequisite
  await page.getByLabel("Password").fill("DISCOVERED_PASS");  // <-- from prerequisite
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("DISCOVERED_REDIRECT", { timeout: 30_000 }); // <-- from prerequisite §2
  await page.waitForTimeout(1000); // let SSE/hydration settle

  await page.screenshot({
    path: "test-results/dev-screenshots/dashboard-desktop.png",
    fullPage: true,
  });

  await browser.close();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Script Rules

1. **Library mode only** — `chromium.launch()`, not `test()`. Avoids config conflicts with `playwright.config.ts`.
2. **Screenshots in gitignored directory** — `test-results/dev-screenshots/` or similar.
3. **Descriptive filenames**: `{page}-{viewport}-{state}.png` (e.g., `dashboard-mobile-sidebar-open.png`).
4. **Never use `networkidle`** — fragile everywhere. SSE, WebSockets, long-polling, and analytics all prevent it from resolving. Always use `waitUntil: "domcontentloaded"` + element-specific waits.
5. **Always close the browser** — prevents orphan Chromium processes.
6. **Always manual login** — `storageState` files go stale. Manual login takes 2 seconds and always works.

## Step 2: Run the Script

Run from the **project root** (where `node_modules/` lives):

```bash
./node_modules/.bin/tsx test-results/dev-screenshots/check.ts
```

**Do NOT use `npx tsx`** — it intermittently fails with "command not found" due to PATH resolution. Always use the explicit local binary path.

If `tsx` isn't installed: try `bun test-results/dev-screenshots/check.ts` or `npx ts-node --esm`.

> **Note**: The script uses `process.exit(1)` which may show a TypeScript diagnostic in IDEs without `@types/node`. This is harmless — tsx runs it fine at runtime. Ignore the squiggle.

## Step 3: Read and Analyze Screenshots

Read each screenshot using the Read tool (Claude can see images natively). Compare what you see against the expectations you formed in Step 0.

### Functional Correctness

- Do all expected elements appear? (headings, buttons, forms, data)
- Are interactive elements in the correct state? (enabled/disabled, expanded/collapsed)
- For authenticated pages: is user info visible? Sidebar populated?
- Does live data update as expected? (SSE counters, polling results)

### Visual Quality

- **Layout**: Content centered/aligned? Any overflow or clipping?
- **Spacing**: Consistent padding/margins? No elements crammed together?
- **Typography**: Correct hierarchy? Readable contrast?
- **Responsive**: Mobile stacks properly? Nothing cut off at 375px?
- **Wide viewports**: Content constrained? Not stretching to fill 1920px?
- **Dark mode / theming**: See dedicated section below.
- **Empty states**: Clear placeholder when no data?
- **Components**: Do UI framework components render correctly?

Report findings as a prioritized list: critical first, then improvements.

### Thinking About Dark Mode

Don't just find-and-replace colors from a table. **Think about what each element IS** and what role it plays visually:

**Is it a neutral surface?** (card background, panel border, divider)
→ Use semantic tokens: `bg-background`, `bg-muted`, `border-border`. These are defined by the theme and adapt automatically.

**Is it an accent/highlight section?** (info panel, stat box, alert)
→ Think about the color's purpose. A blue info panel should still feel blue on dark theme — not gray. Use the color's dark-900/950 range with opacity: `bg-blue-950/30 border-blue-500/20`. The `/30` and `/20` opacity make it subtle rather than garish.

**Is it interactive feedback?** (hover, active, focus states)
→ `hover:bg-muted` and `active:bg-muted/80` work across themes. Hardcoded `hover:bg-gray-50` flashes white on dark backgrounds.

**Is it text?** Think about its hierarchy:
→ Primary text: `text-foreground` (or just inherit — default is foreground)
→ Secondary/label text: `text-muted-foreground`
→ Accent labels: `text-blue-400` or `text-blue-500` (mid-range works on both themes)

**Reference table** for quick lookups when you've already decided the intent:

| Light-mode color (broken on dark) | Semantic replacement |
|-----------------------------------|---------------------|
| `bg-white`, `bg-gray-50` | `bg-background` or `bg-muted` |
| `bg-blue-50`, `bg-green-50` | `bg-blue-950/30`, `bg-green-950/30` |
| `border-gray-200`, `border-gray-300` | `border-border` |
| `border-blue-100` | `border-blue-500/20` |
| `text-gray-500`, `text-gray-400` | `text-muted-foreground` |
| `text-gray-900` | `text-foreground` |
| `hover:bg-gray-50` | `hover:bg-muted` |

> **Example**: The deep-research Python Analysis panel had `border-blue-100 bg-blue-50/50`. On dark theme it rendered as an ugly gray rectangle — the blue was so light it became indistinguishable from gray. The fix `border-blue-500/20 bg-blue-950/30` keeps the blue identity but uses dark-range colors with opacity, looking like a subtle glowing blue panel on dark backgrounds.

## Step 4: Fix Issues

Edit source files. Common patterns:

**Layout/spacing**: Adjust flex/grid classes, `max-w-*`, `p-`, `m-`, `gap-` values.

> **Example**: A `<form>` wrapping CardContent + CardFooter becomes a single flex child, breaking Card's `gap-6`. Fix: add `className="flex flex-col gap-6"` to the form.

**Wide viewport**: Add `mx-auto max-w-xl` (or `max-w-2xl`) to constrain panels.

**Dark mode**: Use the semantic approach from Step 3 — think about intent, not just replacement.

**Responsive**: Add/fix breakpoint classes (`md:`, `lg:`, `xl:`).

## Step 5: Re-screenshot and Verify

Re-run the script from Step 2. Read screenshots. Compare against expectations. Repeat Steps 4-5 until correct.

For targeted re-checks, screenshot only the changed element:

```typescript
const panel = page.locator("[data-testid='stats-panel']");
await panel.screenshot({ path: "test-results/dev-screenshots/panel-after-fix.png" });
```

## Step 6: Interaction Testing

**Design interactions based on your app model from Step 0.** You understand the state machine — now verify transitions.

For each interactive element, reason about what should happen:
- What state change does this trigger? (local state, API call, SSE update)
- How long until the result is visible? (instant for local state, ~1s for API, varies for SSE)
- What should change visually? (counter updates, form clears, error appears, panel refreshes)

**Isolate what you're testing.** If the page has live-updating data (SSE, polling), the background updates will change values between any two screenshots regardless of your action. To verify a specific interaction caused a specific change:

1. **Pause live updates first** if the UI has a pause/stop control
2. **Or read a value that only your action changes** — e.g., the multiplier text (+1 → +2) rather than the count (which increments on its own)
3. **Or use element-specific assertions** instead of visual comparison

Then script the verification:

```typescript
// Expectation: clicking "+" increments the multiplier from +1 to +2
await page.screenshot({ path: "test-results/dev-screenshots/before-increment.png" });

await page.getByRole("button", { name: "+" }).click();
await page.waitForTimeout(1500); // SSE update cycle

await page.screenshot({ path: "test-results/dev-screenshots/after-increment.png" });
```

Read both screenshots and compare the value that your action specifically targets (e.g., multiplier text). If it didn't change, the issue is in the data flow you traced in Step 0 — check the API route, then the SSE handler, then the component state.

**Be creative** — don't just verify the happy path:
- Click buttons rapidly — does state stay consistent?
- Submit a form with empty fields — does validation appear?
- Navigate away and back — does state persist or reset correctly?
- Resize the viewport while SSE is active — does layout reflow cleanly?

## Step 7: Multi-Viewport Sweep

The viewport sweep reuses the already-authenticated page from earlier steps. This works because the auth cookies are stored on the browser **context** (from `browser.newContext()` + `context.newPage()`). If you created the page with `browser.newPage()` instead, viewport changes create a new context and lose auth.

Capture all breakpoints in one script:

```typescript
const viewports = [
  { name: "mobile",  width: 375,  height: 812 },
  { name: "tablet",  width: 768,  height: 1024 },
  { name: "desktop", width: 1280, height: 720 },
  { name: "wide",    width: 1920, height: 1080 },
];

for (const vp of viewports) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `test-results/dev-screenshots/${pageName}-${vp.name}.png`,
    fullPage: true,
  });
}
```

Look for:
- **Mobile**: single-column, hamburger menu, no horizontal scroll
- **Tablet**: transitional layout, sidebar may collapse
- **Desktop**: full sidebar, multi-column where applicable
- **Wide**: content constrained (max-width working)

## Step 8: Cleanup

```bash
rm -rf test-results/dev-screenshots/
```

Never leave temporary scripts in the permanent test directory.

## Getting Unstuck

If the script fails, don't retry the same thing. Diagnose first:

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `goto` timeout (15s+) | Wrong port — another project's server is on the expected port | `curl` ALL listening ports, match HTML `<title>` to this project |
| `tsx: command not found` | PATH issue with `npx` | Use `./node_modules/.bin/tsx` |
| Redirected to `/login` after login | Wrong credentials or cookies not persisting | Verify creds from source; use `context.newPage()` not `browser.newPage()` — cookies are per-context |
| Screenshot is blank/white | Page hasn't hydrated | `waitForTimeout(2000)` or wait for specific element |
| `networkidle` never resolves | SSE/WebSocket keeping connection open | Switch to `domcontentloaded` + element waits |
| Stale UI after code change | Dev server hasn't hot-reloaded | Wait longer, or restart dev server |
| `storageState` auth fails | Token expired or from different session | Switch to manual login |
| `bg-blue-50` looks gray | Light-mode color on dark theme | Think about element's role; use opacity-based dark variant |
| Form fields crammed against button | `<form>` wrapping breaks parent's `gap` | Add `flex flex-col gap-6` to the form |
| Panel stretches at 1920px | No max-width constraint | Add `max-w-xl mx-auto` |
