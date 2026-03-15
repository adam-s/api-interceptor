# Deep Research

pnpm + Turborepo monorepo. Each exploration adds one layer.

## Structure

- `apps/api/` — TypeScript API (`@volat/api`)
- `apps/web/` — Next.js web app (`@volat/web`)
- `packages/db/` — Drizzle ORM + TimescaleDB (`@volat/db`)
- `packages/shared/` — Shared types and validation (`@volat/shared`)
- `services/python/` — Python worker for IPC bridge
- `exploration/` — Blog posts and research (not in pnpm workspace)

## Commands

- `./scripts/ci-local.sh` — Run full CI locally (install, build, typecheck, test, docker)
- `./scripts/ci-local.sh --quick` — Local CI without docker build
- `pnpm turbo build` — Build all packages
- `pnpm turbo typecheck` — Type-check all packages
- `pnpm turbo test` — Run all tests
- `pnpm test` — Run tests via root Vitest (workspace mode)
- `pnpm --filter @volat/web dev` — Run Next.js dev server (port 3000 by default; use `PORT=3002` if Volatio is running)
- `docker build -f apps/api/Dockerfile .` — Build API container
- `docker build -f apps/web/Dockerfile .` — Build web container

## SSE (Server-Sent Events)

Server-side state lives in `apps/web/src/lib/state.ts`. Route Handlers:

- `GET /api/events` — SSE stream (`text/event-stream`), pushes state on every change
- `GET /api/multiplier` — Read current state
- `POST /api/multiplier` — Actions: `increment`, `decrement`, `set` (with `value`), `pause`, `play`

Route Handler requirements: `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"` on every SSE route.

## Debug Logging

`packages/shared/src/debug.ts` provides a unified `DEBUG()` function used by both TypeScript and Python. All output converges on `/tmp/deep-research-debug/debug-YYYY-MM-DD.log`. Disabled in test and production; override with `DEBUG_LOGGING=true`.

- **TypeScript**: `import { DEBUG } from "@volat/shared"` (or `import { DEBUG } from "@/lib/debug"` in the web app)
- **Python**: `DEBUG()` in `services/python/worker.py` mirrors the TypeScript signature exactly
- **Data factories**: Pass `() => ({...})` / `lambda: {...}` — never evaluated when logging is off

## Database

`packages/db/` provides Drizzle ORM with TimescaleDB (PostgreSQL 16). Docker container on port 5433.

- **Connection**: `PGPASSWORD=research123 psql -U deepresearch -h localhost -p 5433 -d deep_research`
- **Start DB**: `docker compose up postgres -d`
- **Run migrations**: `cd packages/db && pnpm run migrate`
- **Setup hypertables**: `cd packages/db && pnpm run setup` (runs migrate + hypertable conversion)
- **Generate migration**: `cd packages/db && pnpm run generate`
- **Drizzle Studio**: `cd packages/db && pnpm run studio`

Schema: `stocks` (symbol PK) + `daily_bars` (timestamptz hypertable, 1-month chunks) + `users` (auth, role enum). All timestamps use `timestamptz`.

Import: `import { db, stocks, dailyBars, users, eq } from "@volat/db"` — lazy-initialized, safe to import without DATABASE_URL.

- **Seed admin**: `cd packages/db && pnpm run seed` — creates `admin@deep-research.dev` / `Admin123!`

## Authentication

NextAuth v5 (Auth.js) with Credentials provider and JWT strategy. Config at `apps/web/src/auth.ts`.

- **Login**: `/login` — email + password form
- **Register**: `/register` — creates user with bcrypt hash
- **Protected routes**: Dashboard layout calls `await auth()` server-side, redirects to `/login` if null (component-level, not middleware)
- **Session**: `useSession()` from `next-auth/react` in client components, `auth()` in server components
- **Sign out**: `signOut({ callbackUrl: "/login" })` from `next-auth/react`

Key files:

- `apps/web/src/auth.ts` — NextAuth config with explicit typed exports (TS2742 fix)
- `apps/web/src/lib/actions/auth.ts` — Server actions (login, register)
- `apps/web/src/lib/validations/auth.ts` — Zod v4 schemas
- `apps/web/src/components/auth/` — Login and register forms
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` — Route handler

Gotchas:

- **TS2742**: Use `NextAuthResult["auth"]` typed exports, not destructured `const { auth } = NextAuth()`
- **Zod v4**: Use `standardSchemaResolver` from `@hookform/resolvers/standard-schema` (not `zodResolver`)
- **NEXT_REDIRECT**: `signIn()` throws on success — don't wrap in try/catch in server actions
- **Monorepo .env**: Next.js only loads `.env` from the app directory. `next.config.ts` loads root `.env` via dotenv

## UI

shadcn/ui (new-york style, slate, CSS variables). Components in `apps/web/src/components/ui/`.

Route groups:

- `(public)/` — Landing page, no auth
- `(auth)/` — Login/register, centered card layout
- `(dashboard)/` — Sidebar layout, auth required. Pages live under `(dashboard)/dashboard/` to map to `/dashboard/*` URLs

Layout components in `apps/web/src/components/layout/`:

- `app-sidebar.tsx` — Sidebar orchestrator with user session
- `nav-main.tsx` — Navigation links
- `nav-user.tsx` — User dropdown with sign-out

## Python Bridge

`packages/shared/src/python-bridge/` provides IPC between TypeScript and Python via stdin/stdout JSON-RPC. Worker at `services/python/worker.py`. The bridge spawns Python as a child process — no HTTP, no ports. The API Dockerfile includes Python for production use.

## CI

**Always run `./scripts/ci-local.sh` before committing.** This mirrors the GitHub Actions pipeline locally and catches failures before they hit remote CI.

GitHub Actions runs on push to `main` and on PRs. Steps: install, build, typecheck, test, docker build.

## Conventions

- Branch naming: `feat/<exploration-number>-<short-name>` (e.g., `feat/03-claude-code`)
- Commit messages: imperative mood, concise
- Blog posts go in `exploration/<number>_<slug>/README.md`
- Each exploration gets its own PR merged to main

## Blog Style Guides

See `docs/blog/style-guide/` for full guides. Summary:

- **Overreacted**: Narrative, personal story reveals a principle (used for 01)
- **CSS-Tricks**: Complete reference guide, TOC, property templates (used for 02)
- **Soshnikov (Textbook-Narrative)**: Teach one concept completely, formal deep-dive with diagrams
- **A List Apart (Editorial Essay)**: Persuasive argument with a thesis, analogies from outside tech
- **Editing Lessons** (`editing-lessons.md`): Tone rules — cut noise, first person over generalizations, don't stack sentence fragments

Choose based on content type. Hybrid is fine.

## Blog Approach

The audience is TypeScript developers. Blog posts are about what we discovered that isn't widely known — problems we hit, solutions we found, things we learned that add to the knowledge base rather than repeat it. Reference: `exploration/01_to_bun_or_not_to_bun/` (13 real Bun problems nobody else had documented together).

Rules:

- Build the feature first, then write about what we discovered
- Never explain what the audience already knows — no setup tutorials, no "what is X" sections
- Choose the style guide that fits the content, not the other way around
- If an exploration produces nothing worth sharing, skip the blog post

When a blog post is written, add it to the Blog Posts table in `README.md`.
