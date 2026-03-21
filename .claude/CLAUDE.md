# Interceptor

Discover a website's internal API via browser traffic interception, create a domain plugin with typed proxy routes, and prove each route with curl. The browser IS the API client.

**After discovery, create a domain plugin** in `domains/<name>/` with routes that serve JSON. Follow `.claude/rules/` for the discovery protocol. See `domains/boardshop/` for working reference code — Routes 1-2 show embedded JSON extraction (the most common pattern), Routes 3-4 show direct HTTP and escalation.

## Structure

- `apps/api/` — Hono API server with WebSocket + browser streaming (`@interceptor/api`)
- `apps/web/` — Next.js frontend (`@interceptor/web`)
- `packages/browser/` — Patchright browser automation + transport classifier (`@interceptor/browser`)
- `packages/shared/` — Shared types, validation, debug logging (`@interceptor/shared`)
- `packages/test-server/` — Fake websites on port 4444 for validating discovery (`@interceptor/test-server`)
- `packages/db/` — Drizzle ORM + TimescaleDB (optional)
- `services/python/` — Python worker for IPC bridge
- `domains/boardshop/` — Reference domain with working routes for every transport type

## Quick Commands

```bash
pnpm dev                              # Start all services (API 3001, Web 3000)
pnpm --filter @interceptor/api dev    # API only
pnpm --filter @interceptor/web dev    # Web only
pnpm --filter @interceptor/test-server start  # Test server on 4444
./scripts/ci-local.sh                 # Full CI (run before committing)
```

## Key Architecture

- **Browser WebSocket:** `ws://localhost:3001/browser/stream?profile=<domain>&url=<target>`
- **Traffic capture:** `GET /browser/traffic` (only WS-connected browsers capture traffic)
- **Domain proxy:** `GET /api/<domain>/<path>`
- **Test server sites:** boardshop (embedded JSON), liveboard (WebSocket + protobuf), streamshop (GraphQL + HLS), databoard (gRPC-Web + encoded)
- **Debug logs:** `import { DEBUG } from "@interceptor/shared"` → `/tmp/interceptor-debug/`

## Worktree Agents — DO NOT MODIFY THE MAIN REPO

If you are running in a worktree (`pwd` contains `/tmp/interceptor-worktrees/`):
- **ALL files go in YOUR worktree.** Never write to the original repo.
- **NEVER modify** `apps/api/src/register-domains.ts`, `apps/api/package.json`, or `pnpm-lock.yaml`
- **NEVER run** `pnpm install` — it creates workspace links in the main repo
- Your domain plugin is standalone. Test with curl directly against the target site.

## Conventions

- Import paths: `@interceptor/[package]`
- TypeScript strict mode; Vitest for tests; Biome for linting
- Frontend API URLs: relative (`/api/...`), not `http://localhost:3001/...`
- Never `git add -A` — stage specific files by name
- Always run `./scripts/ci-local.sh` before committing
