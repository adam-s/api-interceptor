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
7. Commit and push all fixes
8. Write handoff doc (.claude/tuning-handoff.md)
9. Start fresh Claude Code session to clear stale context, repeat
```

## Cleanup Before EVERY Iteration

```bash
bash .claude/hooks/cleanup-agents.sh
```

This kills all agent processes, removes all worktrees, cleans untracked domains, and reverts contaminated shared files.

## Stale Context Problem

Subagents inherit the parent session's system-reminder context, which may contain OLD file contents from deleted/modified rules files. This causes agents to reference files that no longer exist.

**Fix: start a fresh Claude Code session before each iteration batch.** Write a handoff doc first so the new session can pick up where you left off.

## Session Handoff

Before ending a session, write the handoff file:

```bash
# The orchestrator writes this before session end
cat > .claude/tuning-handoff.md << 'EOF'
# Instruction Tuning Handoff

## Current Iteration: N

## Results Table
| Agent | Iter N Tokens | Routes | Elimination | New transports |
|-------|--------------|--------|-------------|----------------|
| ... | ... | ... | ... | ... |

## What Changed This Session
- [list of commits with one-line summaries]

## What's Next
- [specific items from the plan]

## How to Launch Next Iteration
1. bash .claude/hooks/cleanup-agents.sh
2. Launch agents (see Parallel Testing below)
3. Watch for contamination: ls domains/ and git diff
4. Score each agent against the scorecard
EOF
```

The new session reads this file and continues from where you left off. The subagents get clean system-reminders because the new session reads `.claude/` files fresh from disk.

## Parallel Testing

Launch agents with worktree isolation. Each gets a unique port.

```
Agent 1: PORT=3011  (isolation: "worktree", run_in_background: true)
Agent 2: PORT=3012  ...
Agent N: PORT=3010+N  ...
```

Agent prompt template:
```
Discover ALL transport types that [site] uses. Build a route for EVERY transport found.
Target: [url]
Follow .claude/rules/discovery.md — GATHER→SCAN→CLASSIFY→BUILD. Fill ALL 8 elimination rows before writing code.
PORT=XXXX pnpm --filter @interceptor/api dev > /tmp/api-server-XXXX.log 2>&1 &
.claude/hooks/track-pid.sh $! XXXX "api-server"
sleep 8 && curl -s http://localhost:XXXX/health
./scripts/connect-browser.sh --profile DOMAIN --url TARGET --port XXXX
```

## Scorecard

For each completed agent:

| Check | Pass/Fail |
|-------|-----------|
| Full elimination table (all 8 rows ✓ or ✗) | |
| Route built for EVERY ✓ transport | |
| Used GATHER→SCAN→CLASSIFY→BUILD pipeline | |
| Did NOT search for public APIs | |
| Routes proven with curl or browserFetch | |
| Wrote files to worktree, not main repo | |
| Stayed under 100 tool calls | |

## Generalization Rule

Every instruction change must work for ANY website. If a fix only helps for a specific site, it's overfitting. Never put specific website names, URLs, or transport classifications in instruction files.

## Convergence

The loop converges when fresh agents (clean session, no hints):
1. Follow the GATHER→SCAN→CLASSIFY→BUILD pipeline
2. Fill all 8 elimination rows before writing code
3. Build routes for every ✓ transport (including WebSocket, HLS, encoded)
4. Stay under 100 tool calls
5. Write all files to worktree, not main repo
