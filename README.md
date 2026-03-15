# Deep Research

"A people without history
Is not redeemed from time, for history is a pattern
Of timeless moments." -- T.S. Eliot

In order to escape the cycle of history repeating we find patterns and change. In order to plan for where we are going, we need to understand our history and where we have been.

This repository is an exploration of techniques to find patterns. Although well known to be difficult, this is an attempt at extracting patterns from stock and stock options trading data. I doubt there will be predictive value, nonetheless, the ideas could be applied to other fields like analyzing medical research data.

---

## Blog Posts

| # | Title | Status |
|---|-------|--------|
| 01 | [We Chose Bun for Everything. Here's What Happened](exploration/01_to_bun_or_not_to_bun/README.md) | Draft |
| 02 | [Dockerizing a pnpm + Turborepo Monorepo](exploration/02_docker/README.md) | Draft |
| 03 | [Catch It Before You Push](exploration/03_local_ci/README.md) | Draft |
| 04 | [A Complete Guide to the .claude Directory](exploration/04_claude_setup/README.md) | Draft |
| 05 | [What Your Editor Should Remember](exploration/05_memory/README.md) | Draft |
| 06 | Vitest (infrastructure only) | — |
| 07 | Next.js (infrastructure only) | — |
| 08 | [The Connection That Never Closes](exploration/08_sse/README.md) | Draft |
| 09 | [Teaching an AI Where to Look](exploration/09_skills/README.md) | Draft |
| 10 | [The Pipe Nobody Told You About](exploration/10_python_bridge/README.md) | Draft |
| 11 | [Two Runtimes, One Timeline](exploration/11_unified_debug/README.md) | Draft |
| 12 | Systematic testing skill (infrastructure only) | — |
| 13 | [TimescaleDB Is Just Postgres](exploration/13_drizzle_timescaledb/README.md) | Draft |
| 14 | shadcn/ui + dashboard layout (infrastructure only) | — |
| 15 | [Seven Things Nobody Tells You About NextAuth v5](exploration/15_auth/README.md) | Draft |

---

## Monorepo

pnpm workspaces + Turborepo. Each exploration adds one layer.

```text
apps/api/          @volat/api
apps/web/          @volat/web — Next.js 16 + shadcn/ui + NextAuth v5
packages/db/       @volat/db — Drizzle ORM + TimescaleDB
packages/shared/   @volat/shared
services/python/   Python worker for IPC bridge
exploration/       Blog posts and research (not in pnpm workspace)
```
