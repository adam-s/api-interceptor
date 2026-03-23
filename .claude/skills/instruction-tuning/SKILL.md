---
name: instruction-tuning
description: Use sub-agents as test subjects to iteratively improve .claude/ instruction files. Run agent → inspect → fix instructions → re-run until agents follow the protocol correctly without hints.
---

> **DO NOT write memory files.** All learnings go into `.claude/rules/`, `.claude/agents/`, test-server code, or boardshop reference routes — NOT into memory.

# Instruction Tuning via Sub-Agent Testing

## How This Works

You are not writing code. You are writing instructions that make other agents write correct code.

1. **Launch sub-agents** on real websites and watch their behavior in real time.
2. **Ask yourself: "Would I do it this way?"** Compare the agent's approach to how you would solve the problem. When the agent makes a choice you wouldn't make — navigates to the wrong page, extracts data instead of interacting, gives up after one try — that's an instruction gap.
3. **Fix the instructions so the agent would do what you would do.** The `.claude/` files are the only lever. You can't hint, coach, or correct the agent mid-run. The instructions must be clear enough that a fresh agent, reading them for the first time, makes the same choices you would make.
4. **Re-run and verify.** Launch fresh agents on the same sites. If they still diverge from your approach, the instructions are still wrong — find the gap and fix it again.

The sub-agent's code is throwaway. The instruction improvements are the product. Every iteration should close the gap between "what the agent does" and "what you would do."

## The Loop

```
1. Clean: bash .claude/hooks/cleanup-agents.sh
2. Launch sub-agents with worktree isolation
3. Wait for completion
4. Inspect: did they follow the pipeline? Full elimination table?
5. Diagnose: which instruction was too soft, missing, or contradictory?
6. Fix the instruction (generalized, not site-specific)
7. CONSISTENCY CHECK — before committing, search ALL .claude/ files for contradictions:
   - Grep for the concept you changed (pagination, testing, session harvest, etc.)
   - Verify every mention says the same thing across rules/, agents/, skills/
   - Fix any file that contradicts or uses softer language than your change
8. PRUNE .claude/ — delete redundant lines, reduce noise, keep instructions tight. Shorter files are followed better. If a rule can be said in 1 line instead of 3, use 1 line.
9. PROCESS CLEANUP — kill all zombie processes before and after every iteration:
   ```bash
   bash .claude/hooks/cleanup-agents.sh
   # Verify nothing is left:
   pgrep -f "chromium|patchright|tsx.*src/index|next-server|node.*api" | head -20
   lsof -iTCP:3010-3020 -sTCP:LISTEN 2>/dev/null
   ```
   Chrome instances, API servers, Next.js servers, Patchright browsers, and Claude sub-agents all leak if not cleaned up. This is critical — orphaned processes consume memory and block ports.
10. FIX INFRASTRUCTURE — if agents waste calls on browser crashes, server restarts, package linking, or port conflicts, fix the underlying infrastructure (scripts, server code, browser service) not just the instructions. Infrastructure bugs burn more tokens than protocol bugs.
11. BUILD UTILITIES — if agents repeat the same multi-step operation (connect browser + wait + check traffic, restart server + wait + health check), create a script or endpoint that does it in one call. Fewer tool calls = fewer tokens.
12. Add any new patterns to test-server + boardshop reference routes
13. Commit and push all fixes
14. Write handoff doc (.claude/tuning-handoff.md) — gitignored, not committed
15. Start fresh Claude Code session to clear stale context, repeat
```

## Consistency Check (Step 7)

When you change an instruction, the same concept appears in multiple files. A fix in `discovery.md` means nothing if `discovery-agent.md` or a SKILL.md still uses the old soft language.

**Before committing any instruction change, search all .claude/ for the concept:**

```bash
# Example: if you tightened pagination language
grep -rn "pagina\|totalCount\|hasMore\|complete" .claude/rules/ .claude/agents/ .claude/skills/
```

Every hit must be consistent with your change. Files to check:
- `.claude/rules/discovery.md` — the protocol (agents read this)
- `.claude/agents/discovery-agent.md` — agent instructions (agents inherit this)
- `.claude/skills/instruction-tuning/SKILL.md` — prompt template + scorecard (you control this)
- `.claude/skills/api-discovery/SKILL.md` — discovery skill entry point
- `.claude/skills/api-discovery/reference/*.md` — reference files agents may read
- `.claude/skills/app/SKILL.md` — app builder that launches discovery agents
- `.claude/CLAUDE.md` — top-level project instructions

A single soft "check for" in any file undoes a hard "MUST" in another.

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
In GATHER: connect to HOMEPAGE first and browse naturally (scroll, click) to warm up cookies before navigating to target pages. Intercept pagination traffic. If you see an API endpoint with pagination params (e.g., ?page=1) in traffic, test it directly via page.evaluate("fetch('/api/path?page=2', {credentials:'include'}).then(r=>r.json())..."). For cross-origin APIs, credentials:'include' forwards browser cookies. Use page.evaluate for interaction and fetch() testing — do NOT read __NEXT_DATA__ or DOM data during GATHER. browserFetch is NOT an HTTP endpoint — use page.evaluate("fetch(...)") during discovery.
In CLASSIFY: name the site's core data and verify your transports cover it.
In BUILD: auth-gated endpoints (Gap=Y) go directly to session harvest. Read the session harvest reference file BEFORE writing any harvest code.
In BUILD: after each route, fill the mandatory completeness check. If totalCount > items returned, the route is NOT DONE — paginate before moving to the next route.
Fill ALL 8 elimination rows before writing code.
After building routes, register your domain and test EVERY route through the API server proxy.
Budget: ~150 tool calls. Plan: ~30 GATHER, ~10 SCAN/CLASSIFY, ~80 BUILD, ~30 testing. Do not retry failed requests — unexpected output is information, not failure.
Your port is XXXX.
```

## Scorecard

| Check | Pass/Fail |
|-------|-----------|
| Browser connected to HOMEPAGE first, warmed up before deep navigation | |
| Pagination intercepted in GATHER (new traffic captured OR discovered endpoint confirmed via browser fetch()) | |
| 2a-CHECK: traffic scanned for pagination params, page 2 tested if found | |
| page.evaluate used for interaction + fetch() testing only in GATHER (not for reading __NEXT_DATA__ or DOM data) | |
| Used {credentials:"include"} for cross-origin fetch() calls | |
| Did NOT try curl /browser/fetch (browserFetch is route-handler only) | |
| Full elimination table (all 8 rows ✓ or ✗) | |
| Route built for EVERY ✓ transport | |
| Used GATHER→SCAN→CLASSIFY→BUILD pipeline | |
| Did NOT search for public APIs | |
| Detail page visited in browser (URL recorded) | |
| Access Gap table produced (Step 2e) | |
| Core data identified in CLASSIFY | |
| Session harvest COMPLETED for Gap=Y endpoints (routes return data, not errors) | |
| Pagination COMPLETE: every route's completeness check shows total == items returned | |
| Routes tested through API server proxy AND return real data (not empty/error) | |
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
4. Validate each route through the API server proxy — returns real data, not empty/error
5. Capture browser traffic (Steps 1d/1e) including detail page visit
6. Complete session harvest for all Gap=Y endpoints (routes return data)
7. Complete pagination for all routes (completeness check: total == items returned)
8. Stay near 150 tool calls (data completeness takes priority over budget)
9. Write all files to worktree, not main repo
