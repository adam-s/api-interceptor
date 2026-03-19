# Interceptor

## Mission

**A developer pastes a natural-language prompt. Claude Code discovers the target website's API via browser traffic interception, creates a typed domain plugin with proxy routes, and builds a working dashboard — without manual intervention beyond the initial prompt.** The browser IS the API client. The skills are the product.

## Rules

Process rules live in `.claude/rules/` and are loaded automatically:

- **`data-transport-discovery.md` — THE MOST IMPORTANT RULE. Systematic protocol to classify how every site serves data (WebSocket, GraphQL, gRPC, JSON API, Encoded API, SSR). Interception ALWAYS over extraction. Never DOM-scrape when the data exists in any network response — decode it instead.**
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

## Key Architecture

- **Browser WebSocket:** `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
- **Traffic capture:** `GET /browser/traffic` — captured request/response entries
- **Transport classifier:** `classifyEntry()` / `classifyPage()` from `@interceptor/browser/shared` — automates the data transport decision tree
- **Domain proxy:** `GET /api/<domain>/<path>` — routes through browser session
- **Test server:** `pnpm --filter @interceptor/test-server start` — serves canonical data via 12 transport types on port 4444
- **Debug logging:** `import { DEBUG } from "@interceptor/shared"` → `/tmp/interceptor-debug/`
- **Python bridge:** IPC via stdin/stdout JSON-RPC at `services/python/worker.py`
- **Auth:** NextAuth v5 (Credentials provider, JWT strategy) at `apps/web/src/auth.ts`

## Conventions

- Import paths: `@interceptor/[package]`
- Monorepo .env: Next.js loads from app dir; `next.config.ts` loads root `.env` via dotenv
- TypeScript: strict mode in all `tsconfig.json`
- Tests: Vitest with workspace mode
- Frontend API URLs: use **relative URLs** (`/api/...`), not `http://localhost:3001/...`. Next.js rewrites proxy in `apps/web/next.config.ts`.
- Rate-limited outbound fetch: use `rateLimitedFetch` from `@interceptor/shared` for `browserRequired: false` routes.
- Never `git add -A` — stage specific files by name.
- Always run `./scripts/ci-local.sh` before committing.
