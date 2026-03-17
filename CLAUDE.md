# Interceptor

## Mission

**This framework's purpose:** A developer pastes any natural-language prompt describing a web application. Claude Code uses the skills to automatically discover the target website's API via browser traffic interception, create a typed domain plugin with proxy routes, and build a working dashboard — without manual intervention beyond the initial prompt. **The browser IS the API client. The skills are the product.**

Every improvement to base skills, utilities, or architecture should serve this mission: reduce the gap between pasting a prompt and getting a working application.

---

## The Fundamental Rule: Base Accumulates All Learning

**`base` is the product. Test branches are disposable experiments.**

Every skill improvement, utility fix, documentation update, architectural insight, and framework capability MUST land on `base` — never only on a test branch. When you create a new test branch from `base`, it inherits every fix ever applied across every previous iteration. When a test branch is done, it is stripped and abandoned. Only `base` grows.

| Lives on `base` (permanent) | Lives only on test branches (ephemeral) |
|---|---|
| `.claude/skills/` | `domains/<name>/` — domain plugins |
| `CLAUDE.md` | Domain-specific route files |
| `docs/temp/ROADMAP.md` | Domain-specific UI pages |
| `docs/temp/DEVELOPER_PROMPTS.md` | `data/browser-profiles/<domain>/` |
| Framework code in `packages/` | Nav entries for domain pages |
| Shared utilities in `apps/api/src/` | `pnpm-lock.yaml` additions for domain deps |

**The invariant:** If you delete every test branch, you lose nothing of lasting value. Everything that matters — every lesson from every iteration — is on `base`.

**The consequence:** A skill or utility fix made on a test branch and NOT applied to `base` is permanently lost the moment you checkout `base` or another branch. This is the most common failure mode. Always apply fixes to `base` first, then branch.

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
- **ALWAYS plan before coding:** call `EnterPlanMode` before writing any new files or modifying existing ones — **EXCEPTION: skip `EnterPlanMode` in Autonomous Iteration Mode** (plan internally, proceed without waiting for approval)
- **NEVER move on without verifying:** each completed step must be proven — curl returns real data, screenshot shows real content
- **USE THE DEBUG SKILL for runtime bugs:** the moment a bug requires understanding runtime behavior (0 frames, wrong values, callbacks not firing, wrong branch taken), invoke `.claude/skills/debug-logs/SKILL.md` — add 2-4 targeted logs, reproduce, read output, fix, remove logs. Do NOT read code for 10+ minutes without logging. Remove all debug logs after the fix is confirmed.
- **NEVER quit half-way:** iterate until the prompt is fully solved and CI is green. Every gap discovered goes in ROADMAP.md. Every base fix gets verified by a new test branch. The loop never ends — it only improves.

### ⚠️ The Notes File Rule — How Learning Moves from Test → Base

**On a test branch, NEVER directly edit CLAUDE.md, ROADMAP.md, DEVELOPER_PROMPTS.md, or `.claude/skills/`.**

Instead, write every failure, root cause, skill gap, and fix idea to the persistent fix queue — a file outside git that is always accessible regardless of branch:

```text
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/base-fixes-needed.md
```

You may prototype a fix on the test branch to verify it works. But record it in `base-fixes-needed.md` so it gets applied permanently to `base`.

When you return to `base`:

1. Read `memory/base-fixes-needed.md`
2. Apply every item to base: skills, CLAUDE.md, ROADMAP.md, utilities, MEMORY.md
3. Delete each item from the file once applied
4. Commit base — file should be empty before cutting the next test branch
5. Create the next test branch — it inherits ALL learnings from ALL prior iterations

**Why:** CLAUDE.md and skills edited on a test branch vanish when you `git checkout base`. The memory fix queue is outside git — it survives every branch switch.

---

## Autonomous Iteration Mode

The user has granted full autonomous operation. You may:

- Commit on `base` without asking (run `./scripts/ci-local.sh` first — must pass)
- Create and switch between test branches without asking
- Make architectural and implementation decisions without asking
- Keep iterating until the prompt is fully solved (all phases verified)
- **Skip `EnterPlanMode`** — plan internally, write code immediately without waiting for approval

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

**Step 1 — On the test branch, wrap up:**

1. Kill running servers
2. Append all failures, root causes, and fix ideas to `memory/base-fixes-needed.md` (outside git — always accessible)
3. Commit domain work: `git add -A && git commit -m "test: iteration complete — <summary>"`

**Step 2 — On base, apply learnings:**

1. `git checkout base`
2. Strip domain artifacts from working tree:
   - `rm -rf domains/<name>/` for each test domain
   - Revert `apps/api/src/register-domains.ts`, `apps/web/src/components/layout/nav-main.tsx`, `pnpm-lock.yaml`
   - `rm -rf data/browser-profiles/<domain>` and `test-results/dev-screenshots/`
3. Read `memory/base-fixes-needed.md` and apply every item to base:
   - `.claude/skills/` — the primary deliverable of every iteration
   - `CLAUDE.md` — Current Iteration State + any new rules
   - `docs/temp/ROADMAP.md` — observed failures log
   - `docs/temp/DEVELOPER_PROMPTS.md` — if a prompt needs revision
   - `memory/MEMORY.md` — if a new pattern needs remembering
4. Clear applied items from `memory/base-fixes-needed.md`
5. `./scripts/ci-local.sh` — must pass
6. `git commit` on base

**Step 3 — Start next iteration:**

1. `git checkout -b test/<id>-v<n+1>` — inherits ALL learnings from ALL iterations

---

## Current Iteration State

**ALWAYS update this block before `git checkout`.** This is the source of truth when resuming.

```text
Branch:        base — all base fixes committed, ready for next test iteration
Prompt:        Prompt 9 (next — TBD)

Prompt 8 (YouTube Without YouTube) — SOLVED on test/youtube-v1:
  ✅ YouTube domain plugin — yt-dlp via Python bridge, browserRequired: false on all routes
  ✅ Search (ytsearch), video info, download management, file streaming with range requests
  ✅ /youtube dashboard — search grid, embedded video player, downloads library
  ✅ Background download threads with progress tracking via job IDs
  ✅ Keyboard shortcuts (Space, F, arrows, M) for video playback
  ✅ Mobile responsive at 375px
  ✅ Related videos, categories, tags, expandable description

Base fixes applied from Prompt 8 iteration:
  ✅ worker.py: from __future__ import annotations for Python 3.9 compat
  ✅ api-discovery skill: CLI tool bridge pattern (yt-dlp, gallery-dl, spotdl)
  ✅ api-discovery skill: PythonBridge path resolution guidance for domain plugins
  ✅ dashboard-builder skill: background job polling pattern
  ✅ dashboard-builder skill: YouTube embed pattern (privacy-enhanced)
  ✅ Fourth consecutive prompt (5,6,7,8) solved on v1 with zero browser dependency

Framework gaps discovered (Prompt 8):
  - yt-dlp is a fourth paradigm: "CLI tool orchestration via Python bridge"
  - System python3 on macOS is 3.9 — needs __future__ annotations for modern type syntax
  - PythonBridge path resolution from domain plugins requires careful ../../../ counting
  - yt-dlp download can hit 403 (YouTube anti-bot) — error handling works, but downloads may need cookies/auth for reliability
  - CLI tool pattern generalizes to gallery-dl (Instagram), spotdl (Spotify), aria2 (generic)

Previous:
Prompt 7 (Reddit Mobile Client) — SOLVED on test/reddit-v1
Prompt 6 (Government & Public Records Monitor) — SOLVED on test/gov-records-v1
Prompt 5 (Academic Research Aggregator) — SOLVED on test/academic-v1
Prompt 4 (Job Search Aggregator) — SOLVED on test/job-search-v1
Prompt 3 (Vacation Rental Intelligence) — SOLVED on test/rental-v1
Prompt 2 (Yahoo Finance) — SOLVED on test/market-v3
Prompt 1 (StubHub) — SOLVED

Next iteration: Run Prompt 9 from docs/temp/DEVELOPER_PROMPTS.md
```

## Conventions

- Import paths: `@interceptor/[package]`
- Monorepo .env: Next.js loads from app dir; `next.config.ts` loads root `.env` via dotenv
- TypeScript: Enable strict mode in all `tsconfig.json`
- Tests: Vitest with workspace mode
