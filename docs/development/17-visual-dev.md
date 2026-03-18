# The Gray Rectangle

The Python Analysis panel was supposed to be blue. A subtle box at the bottom of the dashboard — light blue border, light blue wash behind the text, blue labels for Mean, Median, Stdev. The kind of accent that says "this section is computed differently" without shouting about it.

On the dark theme, it rendered as a gray rectangle.

I didn't notice because I never looked. Twelve E2E tests passing, all assertions green, every heading and button verified by Playwright. The tests checked that elements existed and responded to clicks. None of them checked what the page actually looked like.

---

I had been building a Next.js app with Claude Code. The workflow was: describe what I want, Claude writes the component, I review the code. If the TypeScript compiles and the logic seems right, it ships. For interactive components — an SSE-connected multiplier panel, login forms, a sidebar layout — the E2E tests provided the safety net. Tests pass, move on.

But there's a gap. Claude reads and writes code. It can reason about CSS classes, follow component hierarchies, trace data from a hook through an API route to a Python bridge. What it can't do is see. The dashboard could have a button that overlaps a heading, a panel that stretches to fill a 1920-pixel monitor, or a blue box that turns gray — and Claude would have no way to know unless I told it.

I decided to close that gap with the tool Claude already had: Playwright.

---

Not the test runner. The library API.

Playwright exposes `chromium.launch()` as a standalone function. You don't need `test()` blocks or `expect()` assertions. You don't need `playwright.config.ts`. You write an imperative script: launch browser, navigate, screenshot, close.

```typescript
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto("http://localhost:3002/dashboard", {
  waitUntil: "domcontentloaded",
  timeout: 15_000,
});
await page.screenshot({
  path: "/tmp/interceptor-dev-screenshots/dashboard.png",
  fullPage: true,
});
await browser.close();
```

Claude writes the script, runs it, then reads the screenshot using the Read tool — which, because Claude is multimodal, renders the PNG as an actual image. Claude can see what the page looks like.

That was the plan. Three things went wrong before I got a single screenshot.

---

First, `npx tsx` stopped working. It had worked an hour earlier when I ran a different script. Now: `tsx: command not found`. Same machine, same project, same `node_modules`. PATH resolution in `npx` is a coin flip. The fix was using the explicit binary: `./node_modules/.bin/tsx`. Not elegant, but it never fails.

Second, port 3000 was occupied. Not by this project — by another project's Next.js dev server, still running from the morning. The script connected, waited for a heading that didn't exist in that app, and timed out after 15 seconds. The fix was curling the port first to verify the HTML title matched.

Third, the script used `networkidle` to wait for the page to finish loading. The dashboard streams data over Server-Sent Events. SSE keeps an HTTP connection open permanently. `networkidle` waits for all connections to close. It never fires.

This was the same bug documented in commit thirty-one of the forty-five E2E fix commits I'd studied the week before. I had literally written a blog post about it. I wrote it into the skill instructions, in bold, in a constraints table. And I still defaulted to `networkidle` in the first script I wrote.

The fix: `waitUntil: "domcontentloaded"` plus a specific element wait.

```typescript
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 });
await page.getByRole("heading", { name: "Dashboard" }).waitFor({ timeout: 30_000 });
```

Three failures, three fixes, zero screenshots. Typical Playwright experience.

---

On the fourth attempt, it worked. Twelve screenshots: four pages at three viewport widths. Claude read them all.

The login form was the first finding. The password field sat directly against the Sign In button with no spacing between them. The card component spaces its sections apart with a flex gap — header, content, footer each get breathing room. But the `<form>` element wraps content and footer together into a single child. One child means no gap to apply. The spacing between "type your password" and "submit" just vanishes.

The fix was adding a flex column with the same gap to the form itself. Once you understand the form is absorbing its children into a single flex item, the fix is obvious. But you can't see the missing gap by reading the code — every class looks right. You have to see the rendered output.

The wide viewport was the second finding. At 1920 pixels, the dashboard panel stretched to fill the entire content area. Buttons that looked proportional at 1280 pixels now floated in the center of a vast white rectangle with margins you could park a car in. The fix: constrain the panel's max width and center it.

Then the gray rectangle.

---

The lightest blue in a typical CSS palette looks fine on a white background. It reads as a subtle tint — barely there, exactly what you want for an information panel that shouldn't compete with the primary content. The "this section is special but not urgent" color.

On a dark background, that same lightest blue is a problem. The color has 97% lightness and almost no saturation. Against a dark theme where the background sits around 10% lightness, that near-white patch screams. But the saturation is so low that it doesn't read as blue. It reads as gray. The border is the same story — a faintly tinted light stroke that loses all its color identity against dark.

You could grep the stylesheet for every light blue and swap in a dark equivalent. That fixes the symptom. I wanted Claude to understand the mechanism.

The question isn't "what color should this be?" The question is: what is this element? It's an accent panel. Its job is to feel slightly different from the surrounding content — to signal "Python computed these numbers, not JavaScript." On a light theme, you go lighter than the background. On a dark theme, you go darker. Both cases use the accent color — blue — but at opposite ends of the lightness range.

The fix replaced the lightest blue background with the darkest blue at 30% opacity, and the light border with a mid-blue at 20% opacity. A subtle dark blue wash instead of a subtle light blue wash. Same panel, same job, same "this section is special" intent. But inverted: light-on-light became dark-on-dark.

---

This is where the lookup table breaks down.

The first version of the skill I wrote had a replacement table. Eight rows. Light-mode color on the left, dark-mode equivalent on the right. Find and replace.

The table works for neutral elements. A structural border — the kind that separates sections and outlines input fields — has no color intent. Swapping it for a theme-aware CSS variable is always correct. The theme decides the shade.

But accent colors aren't neutral. The Python Analysis panel isn't gray with a blue tint. It's a blue panel. The fix has to preserve the blue. A lookup table that maps "light blue" to "generic muted background" would make the panel theme-correct but semantically wrong — it would lose its identity as a distinct section.

The third revision of the skill replaced the lookup table with a question: *what is this element?* A neutral surface gets theme variables. An accent section gets dark variants in the same color family. Interactive feedback gets a generic highlight. Text gets categorized by hierarchy — primary, secondary, accent — not by shade number.

Thinking about intent takes longer than find-and-replace. But it produces fixes that survive the next redesign.

---

The skill rewrote itself three times in one session.

Version one hardcoded everything. Specific file paths as the search pattern. Specific credentials. A specific port. A cached authentication file. It worked for the demo dashboard and would break the moment the app changed.

Version two generalized the mechanics. Discover the port by checking what's actually listening. Discover credentials by searching the project's test files and seed data. Log in manually every time instead of trusting a cached session. Every fix addressed something that had failed during the first run.

Version three generalized the thinking. Instead of "glob these paths and read these files," it taught an approach: start from the URL you'll visit, find the route file, follow imports one level, trace data dependencies to the API and backend. Instead of a color replacement table, it taught a framework: identify what the element is, then choose the right fix for that category. Instead of "take a screenshot and fix what looks wrong," it taught: form expectations from the code, then verify with screenshots.

Each revision made the skill less specific to the current app and more useful for the next one.

---

There's a meta-lesson in the fact that the tool needed three versions. I built a system for Claude to see UI problems and iterate until they're fixed. Then Claude used the system and immediately found problems with the system itself. The tool that gives the AI eyes had its own blind spots.

The script runner — the skill said to use it one way, and it failed. The page load strategy — the skill's template used a common approach, and it hung. The authentication shortcut — the skill recommended it, and the session was stale. The file paths — the skill prescribed them, and they'd be wrong for any other project.

Each blind spot was a case where I wrote instructions based on how I thought the tool worked, rather than testing how it actually worked. The same mistake Claude makes when it writes CSS without seeing the rendered output. The same mistake that produced the gray rectangle — imagining a blue panel without testing it against a dark background.

Understanding something in theory and seeing it in practice are different actions. The screenshot loop exists because of that gap. The skill's three revisions exist because of that same gap, one level up.

---

The gray rectangle is still in the git history. Light blue on light background, committed with good intentions, invisible to twelve passing tests. It took giving an AI the ability to see — and then three failed attempts to actually take a screenshot — before anyone noticed it wasn't blue.

I still don't know what other gray rectangles are hiding in the stylesheets.
