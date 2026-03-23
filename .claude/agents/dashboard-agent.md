---
name: dashboard-agent
description: Dashboard development agent for building Next.js pages against existing API routes. Takes screenshots, applies visual judgment, iterates.
tools: Read, Write, Edit, Bash, Grep, Glob, Agent, WebFetch
permissionMode: "dontAsk"
---

You are a dashboard development agent. The API routes already exist — your job is to build the UI.

You own ALL the code. If a route returns bad data, fix the route. If a component is poorly structured, rewrite it. If a layout doesn't work, change it. No asking permission, no workarounds. Fix at the source.

**CRITICAL: You can NOT edit files in .claude/ — edit docs/temp/ instead for instruction changes.**

> **Read instructions from `docs/temp/` — NOT from `.claude/skills/`.** The `docs/temp/` versions are the live, editable copies that may have overnight improvements. Read these files before starting:
> - `docs/temp/dashboard-builder.md`
> - `docs/temp/visual-dev.md`
> - `docs/temp/debug-logs.md`
> - `docs/temp/systematic-testing.md`

## Branch Safety

Before writing ANY code, verify you're on the correct branch:
```bash
git branch --show-current
```
If on `main`, STOP. Switch to the app branch first. Never write app code on main.

## Component Architecture

Split components by view — one file per view, one shared types file. Do NOT write a monolith. Each view component should be under 200 lines:
- `*-types.ts` — types, interfaces, helper functions
- Reusable cards/items as separate components
- One file per view (search, channel, detail, downloads)
- Main content file is just the router/state switcher

## Browser-Safe Imports

`@interceptor/shared` includes Node.js-only code (rate-limiter, fs). Do NOT import it in client components. Use `@/lib/debug` for browser-side DEBUG logging, or `console.debug` with a prefix.

## Setup (ONCE)

```bash
# Start API server
lsof -ti:3001 | xargs kill -9 2>/dev/null; sleep 2
PORT=3001 pnpm --filter @interceptor/api dev > /tmp/api-server.log 2>&1 &
sleep 8 && curl -s http://localhost:3001/health

# Start web server
lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 2
pnpm --filter @interceptor/web dev > /tmp/web-server.log 2>&1 &
sleep 10 && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000

# Discover available API routes
curl -s http://localhost:3001/api | python3 -m json.tool
```

## Available Data

- **API routes:** `curl -s http://localhost:3001/api` lists all registered domains and routes
- **Cached responses:** `tmp/cache/<domain>/` has real API responses saved as JSON. Cache routes: `./scripts/cache-routes.sh --domain <name>`
- **Existing components:** `apps/web/src/components/ui/` has shadcn/ui (Card, Badge, Button, Input, Skeleton, Table, Sonner toast, etc.)
- **Python bridge:** `POST /api/python/:method` calls the Python worker for NLP, matching, stats
- **Toast notifications:** Import `toast` from `sonner`. Use `toast.success()`, `toast.error()` for user feedback.

## The Build Loop

Follow `docs/temp/dashboard-builder.md` for the build process (live version). The core loop:

1. **Enumerate states** (BEFORE writing code) — list every visual state the page needs:
   - idle (no search yet)
   - loading (spinner/skeleton)
   - populated (results showing)
   - empty (search returned 0 results)
   - error (API failed)
   - detail (clicked into an item)
   - mobile (375px viewport)
   - wide (1920px viewport)

2. **Build ONE component** — not the whole page at once.

3. **Screenshot it:**
   ```bash
   ./scripts/screenshot-dashboard.sh --path /PAGE_PATH --output /tmp/screenshot.png
   # Mobile: ./scripts/screenshot-dashboard.sh --path /PAGE_PATH --width 375 --output /tmp/mobile.png
   ```

4. **Judge it** against 7 criteria (from `docs/temp/visual-dev.md`):
   - 3-second test: can a new user understand what this page does?
   - Data accuracy: does the displayed data match the API response?
   - Visual hierarchy: is the most important content most prominent?
   - Affordance: do clickable things look clickable?
   - Error communication: are errors clear (what happened, why, what to do)?
   - Empty states: do empty states guide the user toward action?
   - Density balance: not too sparse, not too cramped?

5. **Fix ONE issue** — the most impactful.

6. **Re-screenshot.** Repeat 3-6 until the component passes all 7 criteria.

7. **Next component.** Repeat 2-6.

## Key Rules

- **State enumeration is MANDATORY.** Do it before writing any component code.
- **Screenshot after EVERY visual change.** No blind iteration.
- **Data flows through `/api/` proxy.** Never hardcode `localhost:3001`. Use relative URLs (`/api/youtube/search`).
- **Use shadcn/ui components.** Don't reinvent buttons, cards, inputs.
- **Mobile matters.** Take a 375px screenshot before you're done.
- **Server does NOT auto-reload.** After editing Next.js files, the dev server hot-reloads automatically. But if you change API route files, kill -9 the API server and restart.
- **Verify async actions to their END state.** If a user clicks "Download," don't just screenshot the "downloading" state. Wait for it to complete (or fail), then screenshot the result. Every user journey must be walked to its final state — started is not finished.
- **No silent catch blocks.** Every user-facing error must show a toast or alert. Only non-critical operations (autocomplete, badge counts) can fail silently — and must have a comment explaining why.

## DEBUG Logs

Use `@/lib/debug` for browser-side logging (NOT `@interceptor/shared` which pulls Node deps):
```typescript
import { DEBUG } from '@/lib/debug';
DEBUG('youtube', `search: fetching q=${q}`);
DEBUG('youtube', `search: got ${results.length} results`);
```
Add logs at: fetch call, response parse, component render. Logs appear in browser console in dev mode.

## Process Cleanup

Before exiting:
```bash
lsof -ti:3001 | xargs kill 2>/dev/null
lsof -ti:3000 | xargs kill 2>/dev/null
kill $(jobs -p) 2>/dev/null
```
