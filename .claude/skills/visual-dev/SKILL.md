---
name: visual-dev
description: Visual development with Patchright screenshots. Use when building, fixing, reviewing, or creating new UI pages and dashboard components. Use when the user wants to build a dashboard, create a new page, verify UI works correctly, or iterate on visual design. Takes screenshots, analyzes layout, iterates until correct.
---

# Visual Development Loop

**This skill is a mandatory validation gate, not an optional polish step.** Every dashboard page must be screenshotted and judged against the 7 criteria before the prompt iteration is considered complete. See CLAUDE.md "The Rule That Makes This Work" section. Skipping this step is how broken buttons, missing padding, and unusable mobile layouts ship.

Use Patchright (anti-detection Playwright fork) as a development tool to see the UI, verify interactions, and improve visual quality through an iterative screenshot loop.

**The core principle**: Build, screenshot, judge, fix, re-screenshot, repeat until you can't find problems. The screenshot loop IS the development loop. Every change gets visually verified. Every visual problem gets fixed immediately. You keep going until you run out of problems to find.

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

**First check if auth exists at all.** Search for login-related files:

```bash
find apps/web/src -name "*.tsx" -path "*/login*" -o -name "*.tsx" -path "*auth*" | head -5
grep -r 'fill.*password\|fill.*email\|getByLabel.*Email' tests/ e2e/ 2>/dev/null | head -3
```

If no login page or auth files exist, **skip login entirely** in the screenshot script — go straight to the target page. Many apps (especially internal tools) have no auth.

If auth exists, search for credentials in this order:

1. `CLAUDE.md` or project README
2. Existing e2e tests — `grep -r 'fill.*password\|fill.*email' tests/ e2e/`
3. Seed files — `prisma/seed.ts`, `drizzle/seed.ts`, `scripts/seed*`
4. Environment files — `.env.test`, `.env.local`

**Also extract the post-login redirect URL** from the same source. E2e auth setup files typically contain a `waitForURL` that reveals where login redirects to (e.g., `**/dashboard`, `**/`, `**/app`). You need this for the `waitForURL` call in your script — don't guess or hardcode `**/dashboard**`.

> **Example**: `tests/e2e/auth.setup.ts` typically has test credentials and a `waitForURL("**/dashboard")` that reveals the post-login redirect. Read it before writing the screenshot script.

### 3. Create the screenshot directory

```bash
mkdir -p test-results/dev-screenshots
```

Verify this path is gitignored. If not, use another gitignored temp directory.

---

## Phase 1: Understand the Application

**Do this before writing any Patchright script.** Read the source code to build a mental model of the app. Screenshots without understanding lead to surface-level fixes that miss structural problems. This code-reading phase is NOT subject to "Skip EnterPlanMode." Understanding what the page should display is required before you can judge a screenshot.

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

The goal is a mental chain: **URL -> page -> components -> data sources -> backend**. You don't need every file — just enough to know what each visible element represents and how interactions flow through the system.

> **Example**: Tracing `/dashboard` might reveal: page renders `<StatsPanel>` -> component subscribes to `EventSource("/api/events")` for live data + `POST /api/actions` for button clicks -> API route delegates to a Python bridge for computation. Now you know: buttons trigger API calls, live data arrives via SSE, stats depend on a backend process being healthy, and there's a ~1s delay between click and visual update.

### Form expectations before screenshotting

Based on the code you just read, predict what you'll see and how interactions should behave:

- What elements should be visible on initial load?
- What should happen when each button/form is used? (state change, API call, visual update)
- How long until results appear? (instant for local state, ~1s for API, variable for SSE)
- At wide viewports, should content be constrained or fill the screen?

These expectations become your verification criteria. When a screenshot doesn't match, you already know where in the stack to look — is it a rendering issue (component), a data issue (hook/API), or a backend issue (service)?

---

## Phase 2: Enumerate States

**Before taking any screenshots**, list every visual state the page can be in. This is the most important step. If you skip it, you'll verify the happy path and ship broken empty states, error states, and edge cases.

### How to enumerate

Start with the 8 required states from the dashboard-builder skill (Idle, Loading, Empty, Populated, Detail loading, Detail populated, Partial offline, Full offline). Then add domain-specific states unique to this page.

Think about the page as a state machine. For each data source the page depends on, consider: what if it's empty? Loading? Errored? Populated with one item? Many items? What if the values are extreme (negative P&L, very long text, zero trades)?

### Example: Trading dashboard states

1. **Empty** — No trades, no signals, no runs (first-time user)
2. **Loading** — Data fetching in progress (skeleton/spinner)
3. **Single open position** — One active trade
4. **Multiple positions** — Several active trades, testing density
5. **Position closed with profit** — Green P&L, positive numbers
6. **Position closed with loss** — Red P&L, negative numbers
7. **Signal = skip** — System decided not to trade today
8. **Job failed** — Pipeline error, error message visible
9. **Session expired** — Degraded mode indicator
10. **Mixed history** — Some wins, some losses, some skips

### Example: Form/config page states

1. **Default values** — Form loaded with defaults
2. **Modified values** — User changed something, unsaved
3. **Saving** — Submit in progress
4. **Save success** — Toast notification
5. **Validation error** — Invalid input highlighted
6. **Live mode warning** — Destructive action confirmation

Write your state list down before proceeding. Each state needs its own screenshot pass.

---

## Phase 3: Build + Verify Loop

This is the core of the skill. It replaces the old linear "screenshot, fix, re-screenshot" with an explicit iteration protocol.

### The Protocol

```
For each state in your enumeration:
  1. Set up the state (seed data, mock API, trigger action)
  2. Screenshot
  3. Judge against criteria
  4. If problems found:
     a. Fix ONE thing
     b. Re-screenshot
     c. Back to step 3
  5. If zero problems: move to next state
```

**Fix one thing at a time.** Multi-fix batches hide which change broke what. One fix, one screenshot, one judgment.

### Judgment Criteria

Apply these 7 tests to every screenshot. They're ordered from most critical to least:

1. **3-second test** — If a user glanced at this for 3 seconds, would they know what's happening? What's the current state of the system? What should they do next?

2. **Data accuracy** — Does every displayed value match the API response? Check for: truncated numbers, wrong decimal places, missing units ($, %, bps), stale data that should have refreshed, dates in wrong format or timezone.

3. **Visual hierarchy** — Is the most important information the most prominent? The eye should be drawn to: status/signal first, then key metrics, then details. If metadata is as prominent as the signal, hierarchy is broken.

4. **Interaction affordance** — Can you tell what's clickable vs. decorative? Do interactive elements have hover states? Are disabled elements visually distinct? Does the cursor change on hoverable items?

5. **Error communication** — When something goes wrong, is it obvious: (a) that something went wrong, (b) what went wrong, and (c) what the user can do about it? "Error" alone fails this test. "Flow pipeline failed: Python worker timed out. Try again or check logs." passes.

6. **Empty states** — When there's no data, is there a clear message? Not a blank panel. Not a spinner that never resolves. A deliberate "No trades yet. Trades will appear here after the next signal." message.

7. **Density balance** — Is the information dense enough to be useful (no wasted whitespace, no giant cards for tiny data), but not so dense it's overwhelming (no 15-column tables with 8pt font)?

### Stopping Criteria

The loop for a given state ends when you can screenshot it and find **zero issues** across all 7 criteria. Not "looks fine" — genuinely zero. If you catch yourself thinking "this is probably okay," it's not done. Name the specific thing that's "probably okay" and decide: is it good or not?

The full page is done when every enumerated state passes at desktop viewport (1280x720).

### Writing the Patchright Script

Create `test-results/dev-screenshots/check.ts`. Use Patchright's **library API** (`chromium.launchPersistentContext`), not the test runner.

**CRITICAL**: Always use Patchright (`import { chromium } from "patchright"`), NEVER `@playwright/test`. Patchright is an anti-detection fork that evades bot detection on sites like SEC.gov, Cloudflare-protected sites, etc. Plain Playwright gets blocked immediately.

### Stealth Configuration (Required)

Every script MUST include these stealth constants:

```typescript
// Stealth browser args — prevent common headless detection methods
const STEALTH_BROWSER_ARGS = [
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-blink-features=AutomationControlled", // Hides navigator.webdriver
  "--disable-dev-shm-usage",
  "--no-sandbox",
  "--disable-infobars",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];

// Real Chrome UA — NEVER include "Headless". Update quarterly from useragents.me
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
```

### Template: Authenticated Page with State Iteration

```typescript
import { chromium } from "patchright";

const BASE_URL = "http://localhost:XXXX"; // <-- from prerequisite

const STEALTH_BROWSER_ARGS = [
  "--no-first-run", "--no-default-browser-check",
  "--disable-blink-features=AutomationControlled",
  "--disable-dev-shm-usage", "--no-sandbox", "--disable-infobars",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async function main() {
  const ctx = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 720 },
    userAgent: USER_AGENT,
    locale: "en-US",
    timezoneId: "America/New_York",
    args: STEALTH_BROWSER_ARGS,
  });

  const page = ctx.pages()[0] || (await ctx.newPage());

  // Always manual login — storageState files from prior e2e runs go stale
  await page.goto(`${BASE_URL}/login`, {
    waitUntil: "domcontentloaded",
    timeout: 15_000,
  });
  await page.getByLabel("Email").fill("DISCOVERED_EMAIL");    // <-- from prerequisite
  await page.getByLabel("Password").fill("DISCOVERED_PASS");  // <-- from prerequisite
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("DISCOVERED_REDIRECT", { timeout: 30_000 }); // <-- from prerequisite
  await page.waitForTimeout(1000); // let SSE/hydration settle

  // --- STATE: Default / Populated ---
  await page.goto(`${BASE_URL}/flow`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "test-results/dev-screenshots/flow-desktop-populated.png",
    fullPage: true,
  });

  // --- STATE: Empty (mock API to return no data) ---
  await page.route("**/flow/trades*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ trades: [], total: 0, limit: 25, offset: 0 }),
    })
  );
  await page.route("**/flow/runs*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ runs: [], total: 0, limit: 10, offset: 0 }),
    })
  );
  await page.goto(`${BASE_URL}/flow`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "test-results/dev-screenshots/flow-desktop-empty.png",
    fullPage: true,
  });
  // Clear route intercepts for next state
  await page.unrouteAll();

  // --- STATE: Error (API failure) ---
  await page.route("**/flow/**", (route) =>
    route.fulfill({ status: 500, body: "Internal Server Error" })
  );
  await page.goto(`${BASE_URL}/flow`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: "test-results/dev-screenshots/flow-desktop-error.png",
    fullPage: true,
  });
  await page.unrouteAll();

  await ctx.close();
  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

### Running the Script

Run from the **project root** (where `node_modules/` lives):

```bash
./node_modules/.bin/tsx test-results/dev-screenshots/check.ts
```

**Do NOT use `npx tsx`** — it intermittently fails with "command not found" due to PATH resolution. Always use the explicit local binary path.

If `tsx` isn't installed: try `bun test-results/dev-screenshots/check.ts` or `npx ts-node --esm`.

### Script Rules

1. **Library mode only** — `chromium.launchPersistentContext()`, not `test()`. Avoids config conflicts with `playwright.config.ts`.
2. **Always use Patchright** — `import { chromium } from "patchright"`, NEVER `@playwright/test`. Patchright evades bot detection; Playwright gets blocked.
3. **Always use `launchPersistentContext`** — more stealthy than `launch()` + `newContext()`. Pass `""` for temp profile dir.
4. **Always include stealth args and real UA** — `STEALTH_BROWSER_ARGS` + Chrome 134 `USER_AGENT`.
5. **Screenshots in gitignored directory** — `test-results/dev-screenshots/` or similar.
6. **Descriptive filenames**: `{page}-{viewport}-{state}.png` (e.g., `flow-desktop-empty.png`).
7. **Never use `networkidle`** — fragile everywhere. SSE, WebSockets, long-polling, and analytics all prevent it from resolving. Always use `waitUntil: "domcontentloaded"` + element-specific waits.
8. **Always close the context** — `await ctx.close()` prevents orphan Chromium processes.
9. **Always manual login** — `storageState` files go stale. Manual login takes 2 seconds and always works.
10. **New pages from context** — use `ctx.newPage()` (not `browser.newPage()`). Auth cookies are per-context.

### Reading and Analyzing Screenshots

Read each screenshot using the Read tool (Claude can see images natively). Compare what you see against the expectations you formed in Phase 1, judged against the 7 criteria.

Report findings as a prioritized list: critical first, then improvements. Fix the most critical issue, re-screenshot, re-judge.

---

## State Setup Recipes

Practical patterns for getting the page into each state during the screenshot script.

### Empty state — No data

Navigate normally. If the API returns empty arrays, you'll see the empty state. If the page always has data, use route interception:

```typescript
await page.route("**/api/trades*", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ trades: [], total: 0 }),
  })
);
```

### Loading state — Capture mid-fetch

Add artificial delay to the route handler:

```typescript
await page.route("**/api/trades*", async (route) => {
  await new Promise((r) => setTimeout(r, 30_000)); // hold forever
  route.fulfill({ status: 200, body: "{}" });
});
// Navigate and immediately screenshot — page is in loading state
await page.goto(`${BASE_URL}/flow`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500); // just enough for the loading skeleton to render
await page.screenshot({ path: "test-results/dev-screenshots/flow-desktop-loading.png" });
```

### Error state — API failure

```typescript
await page.route("**/api/signal", (route) =>
  route.fulfill({ status: 500, body: "Internal Server Error" })
);
```

### Populated with specific data — Seed via API or DB

```typescript
// If you need specific trade states (profit, loss, expired), seed them before screenshotting.
// Use the REST API or direct SQL to create test records, then navigate.
```

### Interaction result states — Trigger the action, then screenshot

```typescript
await page.getByRole("button", { name: "Run Now" }).click();
await page.waitForTimeout(2000); // wait for WS progress events
await page.screenshot({ path: "test-results/dev-screenshots/flow-desktop-running.png" });
```

### Always clean up mocks between states

```typescript
await page.unrouteAll(); // remove all route intercepts before next state
```

---

## UI Component Reference

Full shadcn/ui catalog: **https://ui.shadcn.com/docs/components** — install any component with `cd apps/web && npx shadcn@latest add <name>`.

When building or improving pages, use these components for progressive disclosure — showing more information without leaving the current context.

### Available Components

| Component | Status | Pattern | When to Use |
| --- | --- | --- | --- |
| **Sheet** | Installed | Side panel, slides from edge | Detail view for a selected row (list -> detail) |
| **Tooltip** | Installed | Hover reveal, 0ms delay | Extra data on truncated values, explain abbreviations |
| **Dropdown Menu** | Installed | Context menu on trigger | Per-row actions (view, close, cancel, delete) |
| **Tabs** | `npx shadcn@latest add tabs` | In-place content switching | Switch between views without navigation (Overview / Trades / Audit) |
| **Collapsible** | `npx shadcn@latest add collapsible` | Expand/collapse section | Show/hide metadata, audit trail, market data snapshot |
| **Popover** | `npx shadcn@latest add popover` | Anchored floating panel | Filters, quick stats, mini-forms |
| **HoverCard** | `npx shadcn@latest add hover-card` | Preview on hover | Preview trade details before committing to full detail view |
| **Dialog** | `npx shadcn@latest add dialog` | Centered modal | Confirmations (force close position, switch to live mode) |
| **Resizable** | `npx shadcn@latest add resizable` | Draggable panel dividers | User-adjustable splits between panels |
| **Command** | `npx shadcn@latest add command` | Cmd+K palette | Quick actions, search dates, jump to trade |

### Choosing the Right Component

**Level 1 — Glanceable (no interaction needed):**
Tooltip for extra context on existing elements. Badge/pill for status. Color coding for direction/P&L.

**Level 2 — One click to reveal:**
Collapsible for "show more" sections. Dropdown Menu for row actions. Popover for filters or quick stats.

**Level 3 — Opens a focused context:**
Sheet for detail views (maintains page context behind it). Dialog for confirmations or focused forms. Tabs for alternate views of the same data.

**Level 4 — Power user:**
Command palette for keyboard-driven navigation. Resizable panels for custom layouts.

**Rule of thumb:** Start at Level 1. Add Level 2 when information won't fit at Level 1. Reach for Level 3 when the user needs to focus on a subset. Level 4 is for repeat users who've outgrown the defaults.

---

## Visual Transition Patterns

Components should animate in ways that maintain spatial coherence — the user should always understand where they are and where the new content came from.

| Pattern | Implementation | Use Case |
| --- | --- | --- |
| **Slide-in continuity** | Sheet `side="right"` with default slide animation | List -> detail: detail slides from the edge, list stays "behind" |
| **Fade + scale** | Dialog default: `fade-in-0 zoom-in-95` | Centered overlays that emerge from the page |
| **Shared axis** | Tabs with `transition-all duration-200` on content panels | Content transitions along the same axis the tabs sit on |
| **Collapse push** | Collapsible with `data-[state=open]` animation | Expanding sections push content below naturally |
| **Hover preview -> click commit** | HoverCard shows preview, click opens full Sheet | Two-stage disclosure: peek before committing |
| **Border accent carry** | Row's left border color matches detail panel header | Visual thread connecting selection to detail |
| **Skeleton -> content** | Skeleton component with matched dimensions | Loading preserves layout dimensions, prevents shift |
| **Status color persistence** | Direction color on row = same color in every related view | Green/red/amber carries through list, detail, charts |

### Anti-patterns

- **Jump cuts** — Content appearing instantly with no transition. Disorienting. Add at minimum a 150ms fade.
- **Conflicting directions** — Panel slides in from right, but close button is on the left. Match entry/exit directions.
- **Delayed skeleton** — Showing content for 200ms, then skeleton, then content again. Either show skeleton immediately or don't use one.
- **Color disconnects** — Row is green (profit), but detail panel header is neutral gray. Carry color intent through.

---

## Thinking About Dark Mode

Don't just find-and-replace colors from a table. **Think about what each element IS** and what role it plays visually:

**Is it a neutral surface?** (card background, panel border, divider)
Use semantic tokens: `bg-background`, `bg-muted`, `border-border`. These are defined by the theme and adapt automatically.

**Is it an accent/highlight section?** (info panel, stat box, alert)
Think about the color's purpose. A blue info panel should still feel blue on dark theme — not gray. Use the color's dark-900/950 range with opacity: `bg-blue-950/30 border-blue-500/20`. The `/30` and `/20` opacity make it subtle rather than garish.

**Is it interactive feedback?** (hover, active, focus states)
`hover:bg-muted` and `active:bg-muted/80` work across themes. Hardcoded `hover:bg-gray-50` flashes white on dark backgrounds.

**Is it text?** Think about its hierarchy:

- Primary text: `text-foreground` (or just inherit — default is foreground)
- Secondary/label text: `text-muted-foreground`
- Accent labels: `text-blue-400` or `text-blue-500` (mid-range works on both themes)

**Reference table** for quick lookups when you've already decided the intent:

| Light-mode color (broken on dark) | Semantic replacement |
| --- | --- |
| `bg-white`, `bg-gray-50` | `bg-background` or `bg-muted` |
| `bg-blue-50`, `bg-green-50` | `bg-blue-950/30`, `bg-green-950/30` |
| `border-gray-200`, `border-gray-300` | `border-border` |
| `border-blue-100` | `border-blue-500/20` |
| `text-gray-500`, `text-gray-400` | `text-muted-foreground` |
| `text-gray-900` | `text-foreground` |
| `hover:bg-gray-50` | `hover:bg-muted` |

> **Example**: A panel with `border-blue-100 bg-blue-50/50` renders as an ugly gray rectangle on dark theme — the blue is so light it becomes indistinguishable from gray. The fix `border-blue-500/20 bg-blue-950/30` keeps the blue identity using dark-range colors with opacity: a subtle glowing blue panel that works on both themes.

---

## Phase 4: Interaction Testing

**Design interactions based on your app model from Phase 1.** You understand the state machine — now verify transitions.

For each interactive element, reason about what should happen:

- What state change does this trigger? (local state, API call, SSE update)
- How long until the result is visible? (instant for local state, ~1s for API, varies for SSE)
- What should change visually? (counter updates, form clears, error appears, panel refreshes)

**Isolate what you're testing.** If the page has live-updating data (SSE, polling), the background updates will change values between any two screenshots regardless of your action. To verify a specific interaction caused a specific change:

1. **Pause live updates first** if the UI has a pause/stop control
2. **Or read a value that only your action changes** — e.g., the multiplier text (+1 -> +2) rather than the count (which increments on its own)
3. **Or use element-specific assertions** instead of visual comparison

Then script the verification:

```typescript
// Expectation: clicking "+" increments the multiplier from +1 to +2
await page.screenshot({ path: "test-results/dev-screenshots/before-increment.png" });

await page.getByRole("button", { name: "+" }).click();
await page.waitForTimeout(1500); // SSE update cycle

await page.screenshot({ path: "test-results/dev-screenshots/after-increment.png" });
```

Read both screenshots and compare the value that your action specifically targets (e.g., multiplier text). If it didn't change, the issue is in the data flow you traced in Phase 1 — check the API route, then the SSE handler, then the component state.

**Be creative** — don't just verify the happy path:

- Click buttons rapidly — does state stay consistent?
- Submit a form with empty fields — does validation appear?
- Navigate away and back — does state persist or reset correctly?
- Resize the viewport while SSE is active — does layout reflow cleanly?

---

## Phase 5: Multi-Viewport Sweep

Run this on the most complex state (usually the populated/populated-with-variety state). The viewport sweep reuses the already-authenticated page from earlier. Auth cookies are stored on the persistent **context** (from `launchPersistentContext()`).

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
- **Wide**: content constrained (max-width working), not stretching to fill 1920px

If any viewport has issues, fix and re-screenshot that viewport. Apply the same iteration protocol — fix one thing, re-screenshot, judge.

---

## Common Visual Bugs

Before marking a screenshot pass as "done", check against the common bugs list: [reference/common-visual-bugs.md](reference/common-visual-bugs.md). This list grows as new bugs are discovered across projects. Add any new bugs you find.

---

## Phase 6: Cleanup

Run cleanup only at the very end, after all states pass. Do NOT delete screenshots between component iterations — you may need earlier screenshots for comparison.

Delete the entire directory — this removes both the screenshots **and any scripts** (e.g., `check.ts`, `sheet.ts`) you created there during this session.

```bash
rm -rf test-results/dev-screenshots/
```

**Do this before committing or switching branches.** Never leave Patchright scripts in the repo.

Never leave temporary scripts in the permanent test directory.

---

## Getting Unstuck

If the script fails, don't retry the same thing. Diagnose first:

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `goto` timeout (15s+) | Wrong port — another project's server is on the expected port | `curl` ALL listening ports, match HTML `<title>` to this project |
| `tsx: command not found` | PATH issue with `npx` | Use `./node_modules/.bin/tsx` |
| "Undeclared Automated Tool" or "Bot Detection" | Using `@playwright/test` instead of `patchright`, or missing stealth args | Use `import { chromium } from "patchright"` + `launchPersistentContext` + `STEALTH_BROWSER_ARGS` + real `USER_AGENT` |
| "Request Rate Threshold Exceeded" | Too many requests from same IP in short window | Wait 10+ min for rate limit to expire; add 2-3s delays between page loads to the same domain |
| Redirected to `/login` after login | Wrong credentials or cookies not persisting | Verify creds from source; use `ctx.newPage()` — cookies are per-context |
| Screenshot is blank/white | Page hasn't hydrated | `waitForTimeout(2000)` or wait for specific element |
| `networkidle` never resolves | SSE/WebSocket keeping connection open | Switch to `domcontentloaded` + element waits |
| Stale UI after code change | Dev server hasn't hot-reloaded | Wait longer, or restart dev server |
| `storageState` auth fails | Token expired or from different session | Switch to manual login |
| `bg-blue-50` looks gray | Light-mode color on dark theme | Think about element's role; use opacity-based dark variant |
| Screenshot cuts off content inside scrollable div or Sheet panel | `fullPage: true` extends the *document* scroll, not nested `overflow: auto` elements. Radix Sheet/Dialog (`[data-radix-dialog-content]`) and inner `.overflow-auto` / `.flex-1` elements all need to be expanded. | Before screenshotting: `await page.evaluate(() => { document.querySelectorAll('[data-radix-dialog-content], [data-radix-dialog-content] .overflow-auto, [data-radix-dialog-content] .flex-1').forEach((el) => { const e = el as HTMLElement; e.style.overflow = 'visible'; e.style.height = 'auto'; e.style.maxHeight = 'none'; }); }); await page.waitForTimeout(300);` |
| Form fields crammed against button | `<form>` wrapping breaks parent's `gap` | Add `flex flex-col gap-6` to the form |
| Panel stretches at 1920px | No max-width constraint | Add `max-w-xl mx-auto` |

### Why Patchright, Not Playwright

**Playwright** sets `navigator.webdriver = true`, uses detectable Chrome flags, and has fingerprints that bot detection services (Cloudflare, SEC, DataDome) catch immediately. Sites return "Access Denied", CAPTCHAs, or empty pages.

**Patchright** is a drop-in fork that patches these detection vectors at the Chromium level. Combined with:

- `--disable-blink-features=AutomationControlled` (hides `navigator.webdriver`)
- `launchPersistentContext` (creates a real browser profile, not a bare context)
- Real User-Agent strings (not the default headless UA)
- Locale/timezone matching (consistent fingerprint)

...it passes as a real browser. Verified working against government sites, financial data providers, and news services with aggressive bot detection.
