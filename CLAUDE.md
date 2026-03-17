# Interceptor

## Mission

**This framework's purpose:** A developer pastes any natural-language prompt describing a web application. Claude Code uses the skills to automatically discover the target website's API via browser traffic interception, create a typed domain plugin with proxy routes, and build a working dashboard — without manual intervention beyond the initial prompt. **The browser IS the API client. The skills are the product.**

Every improvement to base skills, utilities, or architecture should serve this mission: reduce the gap between pasting a prompt and getting a working application.

---

## The Fundamental Rule: Base Accumulates All Learning

**`base` is the product. Test branches are disposable experiments.**

Every skill improvement, utility fix, documentation update, architectural insight, and framework capability MUST land on `base` — never only on a test branch. When you create a new test branch from `base`, it inherits every fix ever applied across every previous iteration. When a test branch is done, it is stripped and abandoned. Only `base` grows.

| Lives on `base` (permanent) | Lives only on test branches (ephemeral) |
| --- | --- |
| `.claude/skills/` | `domains/<name>/` — domain plugins |
| `CLAUDE.md` | Domain-specific route files |
| `docs/temp/ROADMAP.md` | Domain-specific UI pages |
| `docs/temp/DEVELOPER_PROMPTS.md` | `data/browser-profiles/<domain>/` |
| Framework code in `packages/` | Nav entries for domain pages |
| Shared utilities in `apps/api/src/` | `pnpm-lock.yaml` additions for domain deps |

**The invariant:** If you delete every test branch, you lose nothing of lasting value. Everything that matters — every lesson from every iteration — is on `base`.

**The consequence:** A skill or utility fix made on a test branch and NOT applied to `base` is permanently lost the moment you checkout `base` or another branch. This is the most common failure mode. Always apply fixes to `base` first, then branch.

**Skills must be domain-agnostic.** Skills teach HOW (generalized patterns); prompts in `docs/temp/DEVELOPER_PROMPTS.md` teach WHAT (domain-specific details). If a skill names a specific website, API, or domain, extract that detail into the relevant prompt's "Discovery hints" section and replace with a one-line generalized statement.

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

- **Verify every step:** curl returns real data, screenshot shows real content — never move on without proof
- **Debug skill for runtime bugs:** add 2-4 targeted `DEBUG()` logs, reproduce, read output, fix, remove logs. Do NOT read code for 10+ minutes without logging.
- **Never quit half-way:** iterate until the prompt is fully solved and CI is green
- **Commit base clean before cutting branches:** always commit `base` to a clean, passing state BEFORE creating test branches — the branch point is permanent and cannot be retroactively fixed without rebase
- **Never `git add -A`:** stage specific files by name. `git add -A` catches `data/browser-profiles/` cache, `.env` files, and other local artifacts. Prefer dependency injection over hardcoded imports — framework code in `packages/` must be clean of domain-specific code.
- **Document mistakes immediately:** when something goes wrong, add a one-line note to `base-fixes-needed.md` (or the relevant skill's gotchas) describing what happened and how to avoid it. Don't wait until the end of the iteration.
- **Review skills after using them:** after completing work guided by a skill, review what went wrong and add gotchas/lessons to the skill's SKILL.md on the next base pass. Skills improve every iteration.
- **Maintain a running failure log:** during iterations, log every failure with root cause. At the end, sweep: domain-specific stays on the test branch, generalizable fixes go to base skills.

### Notes File Rule (Test -> Base)

**On a test branch, NEVER directly edit CLAUDE.md, ROADMAP.md, DEVELOPER_PROMPTS.md, or `.claude/skills/`.** Write discoveries to the persistent fix queue instead:

```text
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/base-fixes-needed.md
```

On return to `base`: read the file, apply every item, clear it, run CI, commit. The next test branch inherits all learnings.

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
test branch → build prompt → VALIDATE → observe failures → document → git checkout base
→ strip domain artifacts → fix skills/utilities on base (nothing domain-specific)
→ ./scripts/ci-local.sh → git commit → git checkout -b test/<id>-v<n+1> → repeat
```

### Validation Gate (mandatory before committing test work)

**A prompt is NOT done until this gate passes. This is not optional polish — it is the definition of done.**

1. **Visual-dev skill** (`.claude/skills/visual-dev/SKILL.md`): Enumerate every page state (empty, loading, populated, error, mobile). Take Patchright screenshots of each. Judge every screenshot against the 7 criteria (3-second test, data accuracy, visual hierarchy, interaction affordance, error communication, empty states, density balance). Zero issues = pass.
2. **Debug-logs skill** (`.claude/skills/debug-logs/SKILL.md`): For any runtime bug found during visual verification — add targeted `DEBUG()` logs, reproduce, read output, fix, remove logs.
3. **Interaction testing**: Use Patchright to click every button, fill every input, submit every form, test every user journey end-to-end. An untested button is a broken button.
4. **Zero-setup first visit**: Screenshot the page with no prior setup (no browser connected, no data seeded). If the default view shows an error or empty state with no guidance, the page is not done.
5. **Mobile viewport**: Screenshot at 375px width. No overlapping text, no truncated inputs, no broken layouts.

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

1. On test branch: commit domain work, append all discoveries to `memory/base-fixes-needed.md`
2. `git checkout base` -- strip domain artifacts (`rm -rf domains/<name>/`, revert `register-domains.ts`, `nav-main.tsx`, `pnpm-lock.yaml`, browser profiles, screenshots)
3. Apply `memory/base-fixes-needed.md` to: skills, CLAUDE.md, ROADMAP.md, DEVELOPER_PROMPTS.md
4. Clear the file, run `./scripts/ci-local.sh`, commit
5. `git checkout -b test/<id>-v<n+1>` -- inherits all learnings

---

## Current Iteration State

**ALWAYS update this block before `git checkout`.** This is the source of truth when resuming.

```text
Branch:        base — Pass 2 COMPLETE — SKILLS CONVERGED

Pass 1 (Phase B) COMPLETE — all 8 prompts, base at 52 commits (8a2c7bb)

Pass 2 COMPLETE — ALL 8 prompts, ZERO new base fixes:
  P1 StubHub/Ticketmaster — test/pass2-p1-v1 — ZERO fixes
  P2 Yahoo Finance — test/pass2-p2-v1 — ZERO fixes
  P3 Vacation Rentals — test/pass2-p3-v1 — ZERO fixes
  P4 Job Search — test/pass2-p4-v1 — ZERO fixes
  P5 Academic Research — test/pass2-p5-v1 — ZERO fixes
  P6 Gov Records — test/pass2-p6-v1 — ZERO fixes
  P7 Reddit — test/pass2-p7-v1 — ZERO fixes
  P8 YouTube — test/pass2-p8-v1 — ZERO fixes

SKILLS CONVERGED: All 8 prompts across every archetype produced zero new
base fixes. The skills (api-discovery, dashboard-builder, visual-dev,
debug-logs) are complete and self-sufficient for guiding Claude Code
through building any domain plugin + dashboard from a natural language prompt.
```

## Conventions

- Import paths: `@interceptor/[package]`
- Monorepo .env: Next.js loads from app dir; `next.config.ts` loads root `.env` via dotenv
- TypeScript: Enable strict mode in all `tsconfig.json`
- Tests: Vitest with workspace mode
