# Blog Ideas: Architecture & DevOps

25 blog ideas about monorepo architecture, deployment, Docker, CI/CD, and infrastructure decisions.

---

## 1. Scaffolding a Full-Stack Monorepo in a Weekend with AI

**Commits**: `04f38f53`, `008b3d62`, `d94b7f2d`, `617c6e1f`, `964f0092`, `98cd0e2d`, `d1ea42b5`, `f0d313e0`, `b3b6d3e5`, `6551014f`, `58bb37e1`, `fb6471b6`, `fd2469c5`, `1e10ab48`, `4df83c77`, `f5c09729`, `103f589b`, `c98182e9`

**What Happened**: An 11-phase scaffold was executed across a single weekend (Nov 29, 2025), taking the project from empty repository to a fully wired monorepo: pnpm workspace, Bun runtime, Hono API, Drizzle ORM, BullMQ job queues, FastAPI ML service, Next.js 15 dashboard with Auth.js v5, Mastra agents stub, Playwright stealth browser, SST v3 infra, CI pipeline, and Docker Compose. The initial commit was a 2,342-line architecture document — the code came second.

**The Story/Angle**: This is a story about "docs-first development" in the age of AI-assisted coding: write the plan in exhaustive detail, then execute it phase by phase. The interesting tension is that most of those early abstractions (vibes, mood-samples, vibe-oracle) were later entirely replaced. Was the planning worthwhile even when the plan was wrong? Yes — the scaffolding patterns (monorepo structure, DI, barrel exports, CI) survived even as the domain pivoted completely.

**Recommended Styles**:
- **Overreacted**: "The Plan Was Wrong (And That Was the Point)." The personal narrative of writing 2,000 lines of docs before a single line of code, and what happened next.
- **A List Apart**: Argue that architecture documents should be the first artifact, not the last. Analogy: an architect's blueprint vs. a builder's intuition.

---

## 2. The Zod 3 to Zod 4 Migration Nobody Warned You About

**Commits**: `531d09c7`, `922c1727`, `9ca4a609`

**What Happened**: Migrating from Zod 3 to Zod 4.1.13 broke react-hook-form integration because `@hookform/resolvers/zod` doesn't support Zod 4's new Standard Schema interface. The fix required switching every form to `standardSchemaResolver`. API-side validation also needed updates because Zod 4 changed how schema types are inferred.

**The Story/Angle**: Zod 4 is a major breaking change that flew under the radar. The form resolver breakage is particularly insidious: schemas look fine, tests pass, but forms silently stop validating.

**Recommended Styles**:
- **CSS-Tricks**: "Migrating to Zod 4 in a React + Hono monorepo." Cover every breakage point with before/after code.
- **Soshnikov**: Walk through the Standard Schema specification and why Zod 4 adopted it.

---

## 3. Building an Auth System You'll Actually Debug at 2 AM

**Commits**: `4f093bf9`, `ae86cc8c`, `b933cb02`, `91365b0c`, `df229c0c`, `ad848edd`, `276b0731`, `fa3d5a15`

**What Happened**: Full auth built from scratch: Drizzle user schema, NextAuth v5 credentials provider, shadcn/ui forms, server actions, middleware. Then it broke in CI because the `PLAYWRIGHT=1` environment variable wasn't propagating through Next.js's webServer config.

**The Story/Angle**: The gap between "auth works in dev" and "auth works in CI" — environment variable propagation is the most fragile part of any auth system.

**Recommended Styles**:
- **Overreacted**: "The Login Form That Passed Every Test (Except in CI)."
- **CSS-Tricks**: Reference guide covering NextAuth v5 + Drizzle + Playwright E2E in a Bun monorepo.

---

## 4. Making E2E Tests Fast Enough to Actually Run

**Commits**: `1317f6b1`, `291ac963`, `dc782999`, `5f140d20`, `fa3d5a15`, `59c9fb21`

**What Happened**: E2E test infrastructure went through four optimization rounds. Browser caching, `storageState` for auth, dedicated ports (3100/3101), `globalTimeout`. Result: 2.6 minutes → 20 seconds by eliminating 10+ redundant login flows.

**The Story/Angle**: The biggest E2E optimization isn't parallelism or faster browsers — it's not logging in twelve times.

**Recommended Styles**:
- **Soshnikov**: Textbook-style walkthrough of the Playwright auth lifecycle with timing benchmarks at each stage.
- **Overreacted**: "From 2.6 Minutes to 20 Seconds."

---

## 5. Building a Provider Architecture You Can Actually Extend

**Commits**: `657aa6cf`, `6f1d99df`, `deead6e0`, `d7a028bc`

**What Happened**: `defineProvider()` for declarative provider creation (replacing 8-piece boilerplate), `PipelineBuilder` for fluent data pipelines, `SchedulerRegistry` wrapping BullMQ. 9,250 lines added with 305+ tests — before the first real data provider.

**The Story/Angle**: Building the "platform layer" of a monorepo. The deeper question: when is abstraction worth the cost?

**Recommended Styles**:
- **A List Apart**: "Your monorepo's shared package is the most important code you'll write." Analogy: factory assembly line.
- **Soshnikov**: Deep dive into the `defineProvider()` + `PipelineBuilder` + `SchedulerRegistry` trio.

---

## 6. .env Files in a Bun Monorepo: Harder Than You Think

**Commits**: `16af3968`, `3b6b7908`

**What Happened**: Bun doesn't load root `.env` files when running scripts from sub-packages — requiring explicit `--env-file ../../.env`. Root config files (`sst.config.ts`, `vitest.config.ts`) couldn't resolve Node.js globals without a root `tsconfig.json`.

**The Story/Angle**: "10-minute fix, 2-hour debug" problems that never make tutorials. In a monorepo, your working directory determines your reality, and Bun takes that literally.

**Recommended Styles**:
- **Overreacted**: "The Environment Variable That Existed and Didn't."

---

## 7. The Great Monorepo Cleanup: A One-Day Refactoring Sprint

**Commits**: `0ffee211`, `a82b183b`, `8b73260a`, `59eeb541`, `7a4d5921`, `b08986d7`, `2398abe2`, `5237e911`, `56a451f5`

**What Happened**: Single-day reorg: schemas grouped by domain, API routes versioned, feature flags and OpenAPI added, Knip found 17 unused files / 13 unused deps / 69 unused exports, jobs restructured, Turborepo added.

**The Story/Angle**: The moment a solo project outgrows your mental model. Refactoring tooling (Knip, Turborepo) isn't just for large teams.

**Recommended Styles**:
- **Overreacted**: The moment you realize your project has outgrown your head.
- **A List Apart**: Argue there's a specific complexity threshold where solo projects need organizational discipline.

---

## 8. Seventeen Commits to Log In: A NextAuth v5 Production Debugging Saga

**Commits**: `df7e5d58`, `73ea09dd` through `3cd57a3e` (26 commits total)

**What Happened**: First production deployment. Auth broke. 17+ fix commits followed: `NEXT_REDIRECT` swallowed by try/catch, `startTransition` blocking redirects, server-side redirects failing behind reverse proxy, `__Secure-` cookie prefix mismatches, `node:fs` breaking Edge runtime, and a Next.js 16 bug where standalone + middleware were incompatible.

**The Story/Angle**: A war story about five abstractions colliding in production (NextAuth v5, Next.js 16, Edge middleware, Caddy reverse proxy, Docker networking). Each commit is a hypothesis tested and usually falsified. The punchline: a framework bug requiring a version upgrade.

**Recommended Styles**:
- **Overreacted** (primary): "It's 9 PM on a Friday. The login button does nothing." Walk through each layer peeled back.
- **CSS-Tricks** (companion): "The Complete Guide to NextAuth v5 Behind a Reverse Proxy."

---

## 9. Dockerizing a Bun + Next.js Monorepo: Eight Fixes in Two Hours

**Commits**: `df7e5d58`, `73ea09dd`, `016c1e14`, `f43d33ae`, `74828cd6`, `11c5bd1c`, `7b0912d3`, `dc8246cb`

**What Happened**: Eight rapid-fire fixes: pnpm for builds / bun for runtime, copying full `deps` directory, copying `tsconfig.base.json`, standalone output mode, public directory, correct output path for `server.js`.

**The Story/Angle**: Death by a thousand paper cuts. Each fix is trivial; the aggregate reveals how many implicit assumptions exist in a modern JS toolchain.

**Recommended Styles**:
- **CSS-Tricks**: "Dockerizing a Bun + pnpm + Next.js Monorepo: The Complete Checklist."
- **Overreacted**: "Eight Things My Dockerfile Didn't Know About My Monorepo."

---

## 10. The Dockerfile That Took Seven Tries

**Commits**: `5f793818`, `5fd8a2aa`, `bfd9e466`, `31916a67`, `2f4c2bcf`, `4ea5ef83`, `30d32469`, `19cb9f4f`

**What Happened**: Seven consecutive fixes in 41 minutes. Workspace resolution failed → switch to pnpm. pnpm needs glibc → switch to Debian. Debian needs Node.js for pnpm 10+. Then Playwright browser binaries and system dependencies.

**The Story/Angle**: Polyglot toolchains (pnpm + Bun + Playwright + Docker + ARM64) create combinatorial edge cases no single tool's docs cover. Each tool works fine alone; failures live in the intersections.

**Recommended Styles**:
- **Overreacted**: Seven commits to make `bun install` work in Docker. Start at confidence, trace the escalation.
- **CSS-Tricks**: "Complete Guide to Containerizing Bun + Patchright + pnpm Workspaces."

---

## 11. Your Healthcheck Is a Fork Bomb

**Commits**: `b234287a`

**What Happened**: Docker HEALTHCHECK ran `bun -e "import('./run.ts')"` every 30 seconds, starting the entire BullMQ worker each time. On a 2GB instance, this created zombie workers connecting to Redis/Postgres and spawning browsers. Fix: `bun --version`.

**The Story/Angle**: A healthcheck — meant to diagnose — was the disease. The impedance mismatch between Docker's "run a command" model and JavaScript where importing a module has massive side effects.

**Recommended Styles**:
- **Overreacted**: Short, punchy. Title evokes the drama. 5-minute read that sticks.

---

## 12. Lazy Initialization, or How an Import Broke CI

**Commits**: `b71d4c23`, `157d5664`, `63beeb45`, `6c35355f`

**What Happened**: Adding `@volatio/market-db` caused CI to fail — in the *API* tests. Transitive import chain opened a Postgres connection using `MARKET_DATABASE_URL`, which doesn't exist in API CI. Fix: JavaScript Proxy for lazy initialization. Then scripts hung because connections stayed open, requiring explicit `closeMarketDb()`.

**The Story/Angle**: An import is not free in JavaScript. Module-level side effects in monorepos are landmines. The Proxy pattern is a general solution worth teaching.

**Recommended Styles**:
- **A List Apart**: "Every top-level `await` in a shared package is a landmine."
- **Soshnikov**: The Proxy pattern with TypeScript casting gymnastics and cleanup.

---

## 13. Next.js Environment Variables Are Baked at Build Time

**Commits**: `59d9ce38`, `3531f8fa`, `9f2a9bac`, `4c23b674`

**What Happened**: Three deployment surprises: `NEXT_PUBLIC_API_URL` resolved to `localhost:3001` in production (baked at build time), CSP `connect-src` blocked API, and `AUTH_SECRET` needed explicit passing in Edge runtime.

**The Story/Angle**: Common gotchas that cost hours if you don't know them, seconds if you do.

**Recommended Styles**:
- **CSS-Tricks**: "Complete Guide to Deploying Next.js in Docker Behind a Reverse Proxy."

---

## 14. The Patchright Dependency That Infected Everything

**Commits**: `3699450a`, `f5418aac`, `e967d3fe`, `a0fcbba1`, `dfe5c18a`, `8862fae1`, `0eebcc87`

**What Happened**: Patchright ballooned the API bundle from 2.55MB to 12.38MB. Fix required splitting queue exports. Then: Bun bundler external marking, Docker cache copying, pnpm hoisting rules, Bun 1.3.3 100% CPU bug on WebSocket, and Chrome → Chromium for ARM64.

**The Story/Angle**: "Dependency blast radius" — how a leaf dependency affects bundle size, build time, container size, and CPU usage across an entire monorepo.

**Recommended Styles**:
- **Overreacted**: "The Dependency That Wouldn't Stay in Its Box."
- **A List Apart**: Editorial on dependency management in monorepos — the real cost is surface area.

---

## 15. From 20,000 Lines to Zero: Replacing a Job System by Deleting It

**Commits**: `0e81ce74`, `22ad43fe`, `470a3935`

**What Happened**: Old jobs package (broken `waitUntilFinished()`, validators, health checks) replaced with BullMQ Flows: -20,497 lines, +2,864 lines. Vibe system removed too. ~22,000 lines of dead code in three commits.

**The Story/Angle**: The hardest engineering decision is not what to build but what to throw away. The replacement was smaller not because it did less, but because BullMQ Flows eliminated coordination code.

**Recommended Styles**:
- **Overreacted**: "I Deleted 20,000 Lines and the Tests Still Passed."
- **A List Apart**: The lifecycle of internal tools — the demo that becomes production, the validator framework that validates nothing.

---

## 16. Making a Monorepo Reproducible From Scratch

**Commits**: `25d70273`, `99fd348b`, `7b229d6c`

**What Happened**: `.env.example`, migration fixes (6 missing tables discovered), idempotent hypertable setup, realistic seed data, `make setup` entry points, centralized `createRawConnection()`.

**The Story/Angle**: The gap between "works on my machine" and "works from fresh clone." Schema drift (6 tables manually created but never captured in migrations) is a common monorepo problem.

**Recommended Styles**:
- **A List Apart**: Reproducibility is a feature, not a chore. Analogy: scientific reproducibility.
- **CSS-Tricks**: Reference guide for TypeScript + Python + TimescaleDB + Redis monorepo setup.

---

## 17. Seven Attempts to Make a Database Migration Non-Interactive

**Commits**: `ced88c14`, `c9057926`, `65b97d1e`, `370a5c44`, `7ce46941`, `bb4b5e21`, `e79538e9`, `0c321f7d`

**What Happened**: Seven sequential attempts: piping `yes`, `CI=true`, piping `echo`, `TERM=dumb`, `drizzle-kit migrate`, and finally `drizzle-orm migrate()`. Each commit is a different failed strategy.

**The Story/Angle**: Interactive CLI prompts vs. containers. The resolution — dropping from CLI to programmatic API — is the classic escape hatch. Why do CLI tools still not have "CI mode" as first-class?

**Recommended Styles**:
- **Overreacted**: Escalating frustration, increasingly desperate workarounds.
- **A List Apart**: Argue that CLI tools need "CI mode" as a first-class concern.

---

## 18. Bun Inlines Your Environment Variables at Build Time (And It Will Break Your Auth)

**Commits**: `b66831d2`, `729470d0`, `ed989731`, `2de742e9`

**What Happened**: Auth failing with 401s in production. Root cause: Bun's bundler inlines `process.env.NODE_ENV` at build time. Not set during Docker build → hardcoded to `'development'` → wrong cookie name. Fix: detect cookie salt from which cookie is present, not from env var.

**The Story/Angle**: Runtime-vs-buildtime bug specific to Bun. The debugging journey — adding a public diagnostic endpoint because you can't SSH — is a masterclass in production debugging.

**Recommended Styles**:
- **Overreacted**: Working backward from "401 in production" to "Bun literally rewrote my code."
- **CSS-Tricks**: "Bun + Docker + Auth: What You Need to Know."

---

## 19. Database Consolidation in a Running Monorepo

**Commits**: `2c0812d4`, `29a35505`, `d7f03e8b`, `043252a1`, `9a074d54`, `b30c6d98`

**What Happened**: Merged `@volatio/db` and `@volatio/market-db` into one. Updated 51+ files, regenerated single migration for all 37 tables, updated all Docker configs. Created contracts package for shared types.

**The Story/Angle**: "Just rename the imports" cascades into Docker configs, CI/CD, migration history, and package interdependencies.

**Recommended Styles**:
- **A List Apart**: When and how to consolidate databases. Analogy: "moving while the building is occupied."
- **Soshnikov**: Technical specifics of Drizzle ORM migration management.

---

## 20. The ioredis Version Trap: Phantom Type Errors in the Dependency Tree

**Commits**: `9d42534a`, `daa8a646`

**What Happened**: BullMQ 5.66.x requires ioredis 5.8.2. Dependabot upgraded to 5.9.0. TypeScript: "`AbstractConnector` is not derived from `AbstractConnector`." Same class name from two package versions. Fix: `pnpm override`.

**The Story/Angle**: The error makes developers question reality. Structural types + npm version resolution = phantom incompatibilities.

**Recommended Styles**:
- **Overreacted**: "`AbstractConnector is not AbstractConnector`" — where type systems and package managers collide.

---

## 21. ~~SSE, networkidle, and the Playwright Tests That Never Finished~~

> **Written** → [exploration/08_sse/README.md](../../../exploration/08_sse/README.md) — "The Connection That Never Closes" (Overreacted style)

**Commits**: `f7d8e2fc`, `0f20d619`, `a961ed7c`, `685189e1`, `e8b6723a`, `37cbc3a0`, `13eb629e`, `a193ed4b`, `f7f0af20`, `d2f347ba`

**What Happened**: SSE streaming broke all E2E tests because `waitForLoadState('networkidle')` never resolves with a persistent connection. Weeks of fixes: replacing `networkidle` with element waits, rewriting flaky tests, discovering HTML reporter blocks CI, null-guarding bounding boxes. Suite went from 140s to 63s, 23 files down to 13.

**The Story/Angle**: One architectural decision (real-time streaming) topples the entire testing strategy. The rebuilding teaches more about robust E2E testing than the original tests.

**Recommended Styles**:
- **Overreacted**: "I added one feature and broke 200 tests."
- **CSS-Tricks**: "E2E Testing Patterns for Real-Time Web Apps."

---

## 22. The Synthetic Development Environment: Faking Your Way to Faster Feedback

**Commits**: `aedd4941`, `ef094f38`, `aee8082e`, `8b756739`, `d563009a`

**What Happened**: Deterministic price generator with seeded PRNG, floating dev bar, fixture-based replay, `DataProvider` abstraction. `pnpm dev:synthetic` starts everything with fake data — no database, no API keys needed.

**The Story/Angle**: Financial apps have a hard dependency problem. The design decisions matter: seeded PRNG vs. recorded data, `DataProvider` interface vs. API mocking.

**Recommended Styles**:
- **A List Apart**: "Your financial application needs a synthetic mode." Frame: flight simulators as essential infrastructure.
- **CSS-Tricks**: The `DataProvider` pattern and fixture generation as a reference.

---

## 23. Making Simulations Survive Server Restarts: From SSE to BullMQ

**Commits**: `147d2ef8`, `9212f857`, `abb5efd2`, `70b65a02`, `557d64a1`, `0c94980f`

**What Happened**: Four architectures: (1) synchronous HTTP handlers, (2) SSE with client-driven loops (close tab = lose simulation), (3) in-memory server registry (restart = lose everything), (4) BullMQ job persistence. Each solved the previous failure mode but introduced new ones.

**The Story/Angle**: A progression from "works on my machine" to production durability. Each level of durability has a cost.

**Recommended Styles**:
- **Soshnikov**: Formal treatment of each architecture stage with diagrams and failure modes.
- **A List Apart**: "Durability as a spectrum."

---

## 24. Bridging Python and TypeScript: IPC Patterns for a Polyglot Trading System

**Commits**: `6c9ea352`, `0c743ef0`, `ba21a690`, `7bd5c57c`, `a53751f6`, `4905f23f`

**What Happened**: Evolution from multiple service-specific bridges to a single UnifiedBridge using JSON-RPC over stdin/stdout. Key lessons: logging to stderr (stdout is the RPC channel), `isConnected()` must check process exit code, `processDay` must not shadow Node.js `process`, progress chain spans five hops.

**The Story/Angle**: The IPC bridge is the most critical integration point. The "logging to stderr" constraint is something every team discovers the hard way.

**Recommended Styles**:
- **Soshnikov**: JSON-RPC protocol, five-hop progress chain, `isConnected()` check.
- **CSS-Tricks**: "The Complete Guide to Python-TypeScript IPC."

---

## 25. E2E Tests as Architecture Documentation: Rewriting Tests Through Three Refactors

**Commits**: `6562bba0`, `c22c43c6`, `1eef12b7`, `b618b7a0`, `ddc0318a`, `e756796b`, `f065b6be`, `594a4b66`, `18d769a8`, `3b57e3b1`, `1d6dd74e`

**What Happened**: E2E suite rewritten three times as architecture changed. Tests for deleted pages removed, navigation updated, heading assertions fixed. Patterns adopted: skipping flaky CI assertions, timeout management, synthetic test separation.

**The Story/Angle**: E2E tests as living architecture documents, not regression shields. Every deletion was the system working correctly.

**Recommended Styles**:
- **A List Apart**: "E2E tests are living architecture documents." Analogy: cartography — maps redrawn as territory changes.
- **Overreacted**: The frustration of deleting tests for pages that no longer exist.
