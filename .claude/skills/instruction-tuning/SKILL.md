---
name: instruction-tuning
description: Use sub-agents as test subjects to iteratively improve .claude/ instruction files. Run agent → inspect → fix instructions → re-run until agents follow the protocol correctly without hints.
---

> **DO NOT write memory files.** All learnings go into `.claude/rules/`, `.claude/agents/`, test-server code, or boardshop reference routes — NOT into memory.

# Instruction Tuning via Sub-Agent Testing

Sub-agents run real tasks, take shortcuts, you observe the failure, fix the instructions, re-run. The sub-agent's code is throwaway — the instruction improvements are the product.

## The Loop

```
1. Clean: bash .claude/hooks/cleanup-agents.sh
2. Launch sub-agents with worktree isolation
3. Wait for completion
4. Inspect: did they follow the pipeline? Full elimination table?
5. Diagnose: which instruction was too soft, missing, or contradictory?
6. Fix the instruction (generalized, not site-specific)
7. Add any new patterns to test-server + boardshop reference routes
8. Commit and push all fixes
9. Write handoff doc (.claude/tuning-handoff.md) — gitignored, not committed
10. Start fresh Claude Code session to clear stale context, repeat
```

## Cleanup Before EVERY Iteration

```bash
bash .claude/hooks/cleanup-agents.sh
```

Kills all agent processes, removes all worktrees, cleans untracked domains, reverts contaminated shared files.

## Stale Context Problem

Subagents inherit the parent session's system-reminder context, which may contain OLD file contents from deleted/modified rules files. This causes agents to reference files that no longer exist.

**Fix: start a fresh Claude Code session before each iteration batch.** Write a handoff doc so the new session can pick up where you left off.

## Session Handoff

After committing all fixes, write `.claude/tuning-handoff.md` (gitignored) with:

1. **Iteration number** — which iteration completed and what's next
2. **Results table** — tokens, time, routes, elimination status per agent
3. **Test sites and ports** — domain names are OK here (file is temporary, gitignored)
4. **Known issues** — what's still broken
5. **What changed** — commits made during this session
6. **What's next** — specific items for the next iteration

The new session reads this file to pick up context. Subagents get clean system-reminders because the fresh session reads `.claude/` files from disk.

## Parallel Testing

Launch agents with worktree isolation. Each gets a unique port (3010 + N).

Agent prompt template:
```
Discover ALL transport types that [site] uses. Build a route for EVERY transport found.
Target: [url]
Follow .claude/rules/discovery.md — GATHER→SCAN→CLASSIFY→BUILD.
Fill ALL 8 elimination rows before writing code.
After building routes, register your domain and test EVERY route through the API server proxy.
Your port is XXXX.
```

## Scorecard

| Check | Pass/Fail |
|-------|-----------|
| Full elimination table (all 8 rows ✓ or ✗) | |
| Route built for EVERY ✓ transport | |
| Used GATHER→SCAN→CLASSIFY→BUILD pipeline | |
| Did NOT search for public APIs | |
| Browser traffic captured (Steps 1d/1e) | |
| Routes tested through API server proxy (not just curl) | |
| Wrote files to worktree, not main repo | |
| Stayed under 150 tool calls | |

## Crash / Retry / Regression Policy

**On crash:** Check the error message. If it's a fixable infrastructure issue (binary data in traffic, missing dependency, port conflict), apply the code fix and re-launch that single agent. If it's an API-level error (Claude "Could not process image"), check that static resource blocking is working and re-launch.

**On timeout (>20 min):** Kill the agent. Check if it's stuck in a retry loop (429s, WAF challenges, sleep). If so, fix the instruction that allowed the loop and re-launch.

**On success but regression:** Compare route count and transport coverage to the previous iteration. If an agent found fewer transports, check:
- Did it skip browser traffic capture? (Steps 1d/1e)
- Did it hit the tool budget before finishing?
- Did it test through the proxy or just curl directly?

Flag regressions in the handoff doc. Do not accept fewer transports without explanation.

## Deep Analysis (after each iteration)

For each agent, analyze:
- Tool call breakdown: how many in GATHER vs SCAN vs CLASSIFY vs BUILD?
- Infrastructure waste: pnpm install, sleep, server retries
- Did the agent follow the pipeline in order or interleave?
- What new patterns did it discover not in test-server/boardshop?
- Where did it waste the most tool calls?

Add any new patterns to test-server endpoints + boardshop reference routes before the next iteration.

## Generalization Rule

Every instruction change must work for ANY website. If a fix only helps for a specific site, it's overfitting. Never put specific website names, URLs, or transport classifications in instruction files (test-server, boardshop, and CLAUDE.md are the only places for working code examples).

## Convergence

The loop converges when fresh agents (clean session, no hints):
1. Follow the GATHER→SCAN→CLASSIFY→BUILD pipeline
2. Fill all 8 elimination rows before writing code
3. Build routes for every ✓ transport (including WebSocket, HLS, encoded)
4. Validate each route with curl first, then test through the API server proxy
5. Capture browser traffic (Steps 1d/1e)
6. Stay under 150 tool calls
7. Write all files to worktree, not main repo
