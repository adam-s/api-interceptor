# Interceptor

## The #1 Rule: Browser Traffic Interception

**Every data endpoint MUST be discovered by navigating as a real user and capturing browser traffic.** Connect a browser via WebSocket, navigate the target site, capture traffic at `/browser/traffic`, and find the internal API endpoints the site uses. Do NOT search for or use publicly documented developer APIs — we don't have API keys and the goal is to intercept what the browser actually sends.

**Do NOT research endpoints from external sources.** Scraping guides, GitHub gists, blog posts, Stack Overflow answers, API documentation sites, and third-party tools (Scrape.do, Scrapfly, Postman collections) are all banned for endpoint discovery. The ONLY valid source of endpoint information is captured browser traffic from `/browser/traffic`. If you cannot find an endpoint in captured traffic, you haven't navigated to the right page yet — go back to the browser, don't go to Google.

**Before writing ANY data extraction code**, complete the Data Transport Discovery Protocol (`.claude/rules/data-transport-discovery.md`) and produce a Transport Classification table in the conversation. No table = no fetcher.

**`page.evaluate()` for data extraction requires proof.** If you want to use `page.evaluate()` to extract data users see on the page, you must first prove with captured traffic evidence that no network request carries that data. `page.evaluate()` IS allowed for: navigation (clicking, typing), page metadata (URL, title), and auth token extraction (CSRF from hidden inputs). It is NOT allowed for extracting data without evidence from the discovery protocol.

**Why:** DOM extraction causes 60–90s page loads, locale-dependent data, and fragile text parsing. Network interception returns clean JSON in 1–3s.

**DEBUG logging is mandatory.** `import { DEBUG } from '@interceptor/shared'` in every new file. Add `DEBUG()` calls at every decision point: traffic capture, response reading, token extraction, endpoint testing, data processing. Log what you receive BEFORE processing it. Check logs at `/tmp/interceptor-debug/`. On complex sites, debug logging reduces total work by 8-15% — you observe and pivot instead of guessing and retrying.

## Mission

**A developer pastes a natural-language prompt. Claude Code discovers the target website's API via browser traffic interception, creates a typed domain plugin with proxy routes, and builds a working dashboard — without manual intervention beyond the initial prompt.** The browser IS the API client. The skills are the product.

## Rules

Process rules live in `.claude/rules/` and are loaded automatically:

- **`data-transport-discovery.md` — Classify data transport type (WebSocket, GraphQL, JSON API, Embedded JSON, Encoded API, SSR). Interception ALWAYS over extraction.**
- **`discovery-process.md` — The investigative process for finding data and tokens. Read the source, catalog auth values, interact and watch the network, read the JS, follow every trail. Companion to the classification protocol.**
- `inspection-first.md` — observe before guessing, DEBUG comments on every new file
- `prompt-compliance.md` — produce a compliance matrix before every commit
- `base-branch.md` — base accumulates all learning, test branches are disposable
- `workflow.md` — verification, git hygiene, test-to-base flow
- `iteration-loop.md` — autonomous mode, the build loop, server startup, branch management

## Structure

- `apps/api/` — Hono API server with WebSocket + browser streaming (`@interceptor/api`)
- `apps/web/` — Next.js frontend with authentication (`@interceptor/web`)
- `packages/browser/` — Patchright-based browser automation + transport classifier (`@interceptor/browser`)
- `packages/shared/` — Shared types, validation, debug logging (`@interceptor/shared`)
- `packages/test-server/` — Multi-transport test server for validating the discovery protocol (`@interceptor/test-server`)
- `packages/db/` — Database layer (Drizzle ORM + TimescaleDB) — optional
- `services/python/` — Python worker for IPC bridge

## Quick Commands

Default ports: API on 3001, Web on 3000. If ports differ, check with `lsof -iTCP -sTCP:LISTEN -P`.

```bash
pnpm dev                              # Start all services
pnpm --filter @interceptor/web dev    # Run Next.js (port 3000)
pnpm --filter @interceptor/api dev    # Run API (port 3001)
./scripts/ci-local.sh                 # Full CI locally (run before committing)
pnpm biome ci .                       # Lint
pnpm turbo typecheck                  # TypeScript
pnpm turbo build                      # Build all
```

### Browser Connection for Discovery

To capture traffic, connect a browser via WebSocket (the auto-started browser does NOT capture traffic):

```bash
./scripts/connect-browser.sh --profile <domain> --url <target-url>
./scripts/capture-traffic.sh --summary
```

### Fixture-Based UI Development

After API routes are proven with curl, cache responses for instant UI development:

```bash
mkdir -p data/fixtures/{domain}
curl -s http://localhost:3001/api/{domain}/search?q=test > data/fixtures/{domain}/search.json
FIXTURE_DIR=data/fixtures pnpm --filter @interceptor/api dev  # Instant responses, no browser
```

## Key Architecture

- **Browser WebSocket:** `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
- **Traffic capture:** `GET /browser/traffic` — captured request/response entries
- **Transport classifier:** `classifyEntry()` / `classifyPage()` from `@interceptor/browser/shared` — automates the data transport decision tree
- **Domain proxy:** `GET /api/<domain>/<path>` — routes through browser session
- **Test server:** `pnpm --filter @interceptor/test-server start` — composable fake websites on port 4444. Validate discovery approach here before targeting real sites. Sites: `boardshop` (embedded JSON + POST pagination + CSRF), `liveboard` (WebSocket + protobuf + crumb token), `streamshop` (GraphQL + HLS + IRC chat), `databoard` (gRPC-Web + encoded responses + Bearer auth)
- **Debug logging:** `import { DEBUG } from "@interceptor/shared"` → `/tmp/interceptor-debug/`
- **Python bridge:** IPC via stdin/stdout JSON-RPC at `services/python/worker.py`
- **Auth:** NextAuth v5 (Credentials provider, JWT strategy) at `apps/web/src/auth.ts`

## Conventions

- Import paths: `@interceptor/[package]`
- Monorepo .env: Next.js loads from app dir; `next.config.ts` loads root `.env` via dotenv
- TypeScript: strict mode in all `tsconfig.json`
- Tests: Vitest with workspace mode
- Frontend API URLs: use **relative URLs** (`/api/...`), not `http://localhost:3001/...`. Next.js rewrites proxy in `apps/web/next.config.ts`.
- Rate-limited outbound fetch: use `rateLimitedFetch` from `@interceptor/shared` for `browserRequired: false` routes. **Test every endpoint with curl first** — most work without a browser. Only upgrade to `browserFetch` if direct HTTP returns 429/403/WAF.
- `page.evaluate()` for data extraction: **FORBIDDEN without proof.** See The #1 Rule above. Allowed uses: navigation actions (clicking, typing), page metadata (URL, title), auth token extraction (CSRF from hidden inputs), and reading the full HTML source for embedded JSON discovery.
- Every new `.ts`/`.tsx` file: add `// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior` as first line.
- Before fixing any bug: add DEBUG() calls first, observe the actual state, confirm root cause, THEN fix. Never commit a fix without proof.
- Never declare "done" without end-to-end proof (curl output or screenshot showing real data at every step).
- When an API returns empty/zero results: STOP. Add DEBUG logs, read the output, understand WHY, then fix. Do not guess or tweak CSS selectors.
- Unexpected output is information, not failure. Investigate encoding, localization, lazy loading — don't abandon the approach without evidence it *cannot* work.
- Never `git add -A` — stage specific files by name.
- Always run `./scripts/ci-local.sh` before committing.
