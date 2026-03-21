# Instruction Tuning Handoff

## Current Iteration: 9 (next)

## Iteration 8 Results

| # | Tokens | Time | Routes | Elimination | Transport coverage |
|---|--------|------|--------|-------------|--------------------|
| 1 | 72K | 13m | 5 | 8/8 | SSR HTML + RSS (pure SSR) |
| 2 | 88K | 16m | 8 | 8/8 | Embedded + API + JSONP + live polling |
| 3 | 98K | 20m | 14 | 8/8 | Next.js + JSON API (14 endpoints) |
| 4 | 121K | 24m | 9 | 8/8 | GQL + HLS + WS IRC + WS PubSub |
| 5 | 126K | 30m | 10 | 8/8 | SvelteKit + API + WS protobuf |
| 6 | 159K | 32m | 5 | 8/8 | Embedded + JSON API + FormData |
| 7 | crashed | — | — | — | API image error |

Average (6 agents): 111K tokens. 100% elimination table completion.

## Algorithm

GATHER→SCAN→CLASSIFY→BUILD pipeline in `.claude/rules/discovery.md`.
Full elimination table (8 transport rows) required before writing code.
29 reference routes in `domains/boardshop/src/routes.ts`.

## Key Infrastructure

- External worktrees at `/tmp/interceptor-worktrees/`
- Hooks: create-worktree, guard-worktree-writes, cleanup-on-stop, cleanup-agents, track-pid
- Headless browsers, ad blocking disabled, static resources blocked
- Tool budget: 100 calls max

## Known Issues

1. Stale context leaks old file names to subagents. Fix: fresh session.
2. Agents run pnpm install despite instruction. Fix: fresh session (stale context).
3. One site consistently highest at 159K. Fights WAF on subpages.
4. One agent crashed from "Could not process image" API error.

## What's Next

1. Start fresh session (clears stale system-reminders)
2. Run cleanup: `bash .claude/hooks/cleanup-agents.sh`
3. Launch agents (7 targets covering all transport types)
4. Goal: all agents under 130K with full transport coverage
5. Investigate crash prevention (no screenshots in discovery)
