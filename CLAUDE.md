# Interceptor

## Mission

**This framework's purpose:** A developer pastes any natural-language prompt describing a web application. Claude Code uses the skills to automatically discover the target website's API via browser traffic interception, create a typed domain plugin with proxy routes, and build a working dashboard — without manual intervention beyond the initial prompt. **The browser IS the API client. The skills are the product.**

Every improvement to base skills, utilities, or architecture should serve this mission: reduce the gap between pasting a prompt and getting a working application.

---

Monorepo for API interception and typed client generation using Patchright + WebSocket streaming.

## Structure

- `apps/api/` — Hono API server with WebSocket + browser streaming (`@interceptor/api`)
- `apps/web/` — Next.js frontend with authentication (`@interceptor/web`)
- `packages/browser/` — Patchright-based browser automation (`@interceptor/browser`)
- `packages/shared/` — Shared types, validation, debug logging (`@interceptor/shared`)
- `packages/db/` — Database layer (Drizzle ORM + TimescaleDB) — optional
- `services/python/` — Python worker for IPC bridge

## Quick Commands

```bash
# Development
pnpm dev                              # Start all services
pnpm --filter @interceptor/web dev    # Run Next.js (port 3000)
pnpm --filter @interceptor/api dev    # Run API (port 3001)

# Checks
./scripts/ci-local.sh                 # Full CI locally
pnpm biome ci .                       # Lint
pnpm turbo typecheck                  # TypeScript
pnpm turbo test                       # Tests
pnpm turbo build                      # Build all

# Docker
docker build -f apps/api/Dockerfile .
docker build -f apps/web/Dockerfile .
```

## Architecture

### /browser WebSocket API

Streams remote browser session via WebSocket:

- Binary JPEG frames (CDP screencast)
- JSON control messages (navigate, click, type, etc.)
- Traffic capture for API discovery
- Profile support for persistent sessions

Endpoints:

- `GET /browser/traffic` — Captured request/response entries
- `GET /browser/traffic/summary` — Deduplicated endpoint patterns
- `DELETE /browser/traffic` — Clear buffer
- `GET /browser/health` — Browser status

### /dashboard

Real-time state synchronization via WebSocket + Python bridge:

- Server-side state in `apps/api/src/state.ts`
- Client receives updates on every state change
- Python worker performs async computations (stats, analysis)
- Example: multiplier panel with live Python-computed statistics

## Debug Logging

Unified `DEBUG()` function (TypeScript + Python) logs to `/tmp/interceptor-debug/debug-YYYY-MM-DD.log`.

- **TypeScript**: `import { DEBUG } from "@interceptor/shared"`
- **Python**: `DEBUG()` in `services/python/worker.py`
- **Disabled in**: test, production (override with `DEBUG_LOGGING=true`)

Usage:

```typescript
DEBUG("event", () => ({ detail: value })); // Factory (lazy eval)
DEBUG("step-name");                        // Simple message
```

## Authentication

NextAuth v5 (Credentials provider, JWT strategy).

- Config: `apps/web/src/auth.ts`
- Server actions: `apps/web/src/lib/actions/auth.ts`
- Routes:
  - `/login` — Email + password
  - `/register` — Create user
  - `/api/auth/[...nextauth]` — NextAuth handler
  - `/dashboard/*` — Protected (checks auth server-side)

## Database (Optional)

`packages/db/` provides Drizzle ORM + TimescaleDB. Not required for MVP.

- Schema: `users` (auth), stocks, daily_bars (time-series)
- Docker: `docker compose up postgres -d`
- Migrations: `cd packages/db && pnpm run migrate`

Connection: `PGPASSWORD=CHANGE_ME psql -U interceptor -h localhost -p 5433 -d interceptor`

## Python Bridge

IPC via stdin/stdout JSON-RPC. Worker at `services/python/worker.py`.

- No HTTP, no ports
- Spawned as child process
- Request/response via JSON messages
- Example: `compute` request → stats response

## CI

**Always run before committing:**

```bash
./scripts/ci-local.sh
```

GitHub Actions runs on push to `main` and PRs:

- `pnpm install --frozen-lockfile`
- `pnpm biome ci .`
- `pnpm turbo build`
- `pnpm turbo typecheck`
- `pnpm turbo test`
- `docker build` (both API and web)

## Security

⚠️ **Before publishing:**

- [ ] No hardcoded API keys, credentials, or AWS account IDs
- [ ] No private domain names (e.g., company URLs)
- [ ] All examples use localhost or example.com
- [ ] Review `.env.example` and `.env.production.example`
- [ ] Scan git history: `git log --all --full-history -- [file]`

## Workflow Rules

- **NEVER commit unless:** (a) explicitly asked, OR (b) about to switch branches — always commit before `git checkout` to avoid losing work, OR (c) in autonomous iteration mode (see below)
- **ALWAYS plan before coding:** call `EnterPlanMode` before writing any new files or modifying existing ones
- **NEVER move on without verifying:** each completed step must be proven — curl returns real data, screenshot shows real content
- **ALWAYS update CLAUDE.md before switching branches** — the "Current Iteration State" block below must reflect where you are before every `git checkout`

---

## Autonomous Iteration Mode

The user has granted full autonomous operation. You may:

- Commit on `base` without asking (run `./scripts/ci-local.sh` first — must pass)
- Create and switch between test branches without asking
- Make architectural and implementation decisions without asking
- Keep iterating until the prompt is fully solved (all phases verified)

**You MUST update the "Current Iteration State" block below before every `git checkout`.** This is how you preserve state across context resets and branch switches. When you resume a session, read this block first.

### The Iteration Loop

```text
test branch → observe failures → document in docs/temp/ROADMAP.md → git checkout base
→ strip domain artifacts → fix skills/utilities on base (nothing domain-specific)
→ ./scripts/ci-local.sh → git commit → git checkout -b test/<id>-v<n+1> → repeat
```

Full details and checkpoint rules: `docs/temp/ROADMAP.md`

### Server Startup

```bash
# Kill any existing servers first
lsof -ti:3001 | xargs kill -9 2>/dev/null; lsof -ti:3000 | xargs kill -9 2>/dev/null
# Start API (port 3001)
pnpm --filter api dev > /tmp/api-server.log 2>&1 &
# Start web (port 3000)
pnpm --filter web dev > /tmp/web-server.log 2>&1 &
# Wait and verify
sleep 6 && curl -s http://localhost:3001/health && curl -s http://localhost:3000 | head -5
```

Tail logs: `tail -f /tmp/api-server.log` or `tail -f /tmp/web-server.log`

### Returning to Base After a Test Iteration

1. Kill running servers
2. Document all failures in `docs/temp/ROADMAP.md` (failure, root cause, fix needed)
3. Update CLAUDE.md "Current Iteration State" block (set branch to `base`, record what failed)
4. Commit on test branch: `git add -A && git commit -m "test: iteration complete — <summary>"`
5. `git checkout base`
6. Strip domain artifacts:
   - Remove domain routes, pages, nav entries, package.json deps
   - `rm -rf data/browser-profiles/<domain>` if created during test
   - `rm -rf test-results/dev-screenshots/`
7. Fix the specific failures — skills/utilities only, NOTHING domain-specific
8. `./scripts/ci-local.sh` — must pass
9. Update CLAUDE.md "Current Iteration State" block (set next test branch name, phase 1)
10. `git commit` on base
11. `git checkout -b test/<id>-v<n+1>` and continue

---

## Current Iteration State

**ALWAYS update this block before `git checkout`.** This is the source of truth when resuming.

```text
Branch:        test/market-v1
Prompt:        Prompt 2 — Yahoo Finance market intelligence
Phase:         Phase 1 (news pipeline) → Phase 2 (quote/chart) → Phase 3 (dashboard UI)
Last action:   Fixed Failure #1 (browserRequired: false) + committed test/market-v1
Next step:     Verify Phase 1: curl "http://localhost:3001/api/yahoo-finance/news?symbols=TSLA"
               Must return articles with sentiment field (may need to wait out Yahoo rate limit)
               Try sitemap for news: https://finance.yahoo.com/sitemap/2026_03_01/

Phase 1 done: curl returns ≥1 article with {symbol, title, sentiment, score}
Phase 2 done: curl /api/yahoo-finance/quote/TSLA returns {price, changePercent, marketCap}
Phase 3 done: Patchright screenshot of http://localhost:3000/market shows
              watchlist sidebar + quote card + sparkline + news feed with badges + live timestamp

Base fixes needed (carry from test/market-v1):
  - packages/browser/src/handler/domain-loader.ts: browserRequired? in DomainRoute type ← DONE on base
  - packages/browser/src/handler/api-proxy.ts: skip check when browserRequired===false ← DONE on base

Note: Yahoo Finance RSS rate-limits aggressively. Try the sitemap approach:
  https://finance.yahoo.com/sitemap/2026_03_01/
  Parse links to get recent article URLs → fetch individual articles if needed.
  OR wait a few minutes and the RSS endpoints unblock.
```

## Conventions

- Import paths: `@interceptor/[package]`
- Monorepo .env: Next.js loads from app dir; `next.config.ts` loads root `.env` via dotenv
- TypeScript: Enable strict mode in all `tsconfig.json`
- Tests: Vitest with workspace mode
