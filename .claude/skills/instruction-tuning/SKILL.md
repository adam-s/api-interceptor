---
name: instruction-tuning
description: Use sub-agents as test subjects to iteratively improve .claude/ instruction files. Run agent → inspect → fix instructions → re-run until agents follow the protocol correctly without hints.
---

> **DO NOT write memory files.** This skill produces throwaway agent runs. All learnings go into `.claude/rules/`, `.claude/agents/`, test-server code, or boardshop reference routes — NOT into memory. Memory pollutes future agent contexts.

# Instruction Tuning via Sub-Agent Testing

Use sub-agents as test subjects to iteratively improve `.claude/` instruction files. The sub-agent runs a real task, takes shortcuts, you observe the failure, fix the instructions, re-run. The sub-agent's code is throwaway — the instruction improvements are the product.

## The Loop

```
1. Clean memory (remove domain-specific files)
2. Launch sub-agent with a real task prompt
3. Wait for completion
4. Inspect: did it follow the protocol? Where did it shortcut?
5. Diagnose: which instruction was too soft, missing, or contradictory?
6. Fix the instruction — generalized, not task-specific
7. Go to step 1
```

## ⛔ CRITICAL: Clean Base Before EVERY Iteration

**If you skip this, all results are invalid.** Run this cleanup before launching ANY sub-agents:

```bash
# 1. Remove ALL untracked domain dirs (agents leave these behind)
ls domains/ | while read d; do
  if ! git ls-files --error-unmatch "domains/$d" > /dev/null 2>&1; then
    echo "REMOVING untracked domain: $d"
    rm -rf "domains/$d"
  fi
done

# 2. Verify only committed domains remain (should be just boardshop)
echo "Remaining domains:" && ls domains/

# 3. Verify working tree is clean (no uncommitted .claude/ changes)
git status --short .claude/

# 4. Kill orphaned servers and zombie browsers
pkill -f "connect-browser" 2>/dev/null
pkill -f "tsx.*src/index" 2>/dev/null
pkill -f "chromium" 2>/dev/null
pkill -f "chrome" 2>/dev/null
pkill -f "patchright" 2>/dev/null
for port in 3001 3011 3012 3013 3014 3015 3016 3017; do
  lsof -ti:$port | xargs kill 2>/dev/null
done

# 5. Clean stale worktrees
for wt in .claude/worktrees/agent-*; do
  git worktree remove --force "$wt" 2>/dev/null
done
git worktree prune
```

**Why this exists:** Agents in worktrees inherit EVERYTHING from the working tree — including untracked `domains/` directories from prior runs. An agent that finds `domains/youtube/src/routes.ts` already on disk will read the answer instead of discovering it. This contamination is silent and makes results look better than they are.

**The first run of every tuning session must be a baseline with zero `.claude/` changes.** Compare subsequent iterations against this clean baseline, not against contaminated prior runs.

## Memory Contamination

Memory files with domain-specific content also invalidate results. Before every run:

```bash
MEMORY_DIR="$HOME/.claude/projects/$(pwd | tr '/' '-' | sed 's/^-//')/memory"
# Remove domain-specific memories (keep operational ones)
for f in "$MEMORY_DIR"/*.md; do
  [ "$(basename "$f")" = "MEMORY.md" ] && continue
  if grep -qiE "transport|embedded.json|websocket|graphql|crumb|csrf|XHR|SSR|protobuf" "$f" 2>/dev/null; then
    echo "REMOVING: $(basename $f)"
    rm "$f"
  fi
done
```

## Prompt Design

The sub-agent prompt should:
- Describe the task clearly (what data to extract, what to build)
- NOT hint at the solution (don't mention specific transport types)
- Include constraints that test the instructions ("do NOT use public APIs", "do NOT use page.evaluate() for data")
- Request proof of work ("curl output showing real data")

```
Discover the internal APIs that [website] uses to serve [data type].
Follow the discovery protocol in .claude/rules/discovery.md.
Create a domain plugin with proxy routes. Prove each route works with curl.
Do NOT use publicly documented APIs — we don't have API keys.
Do NOT build any dashboard UI. API routes + curl proof only.
```

## Parallel Testing

Launch all agents simultaneously in worktree isolation. Each agent gets a unique port to avoid conflicts.

**Port assignment:** Agent N uses port `3010 + N`. The API server reads `PORT` env var. The `connect-browser.sh` and `capture-traffic.sh` scripts accept `--port`.

```
Agent 1: PORT=3011  (isolation: "worktree", run_in_background: true)
Agent 2: PORT=3012  (isolation: "worktree", run_in_background: true)
Agent 3: PORT=3013  (isolation: "worktree", run_in_background: true)
Agent 4: PORT=3014  (isolation: "worktree", run_in_background: true)
Agent 5: PORT=3015  (isolation: "worktree", run_in_background: true)
Agent 6: PORT=3016  (isolation: "worktree", run_in_background: true)
```

**Each agent's prompt must include:**
```
Start the API server on port XXXX:
  PORT=XXXX pnpm --filter @interceptor/api dev > /tmp/api-server-XXXX.log 2>&1 &
  sleep 8 && curl -s http://localhost:XXXX/health

Use port XXXX for ALL browser connections and traffic capture:
  ./scripts/connect-browser.sh --profile <domain> --url <target> --port XXXX
  curl -s http://localhost:XXXX/browser/traffic
```

**After all agents complete:** clean up worktrees with `git worktree prune`. Kill any orphaned servers with `lsof -ti:3011-3016 | xargs kill`.

**Transport diversity:** pick sites that exercise different transport types to maximize coverage per iteration:

| Transport | What it tests |
|-----------|--------------|
| Embedded JSON (SSR frameworks) | Framework identification, `__NEXT_DATA__` and inline scripts |
| WebSocket + protobuf | Binary decode, JS bundle analysis, subscription messages |
| GraphQL | Query extraction, persisted queries, operation discovery |
| Multi-protocol (WS + GQL + streaming) | Does agent find all transports on one site? |
| WAF-protected SSR | Alternate URL paths, bot detection bypass |
| Encoded/binary responses | Decode protocol — does agent decode instead of DOM scraping? |

## A/B Testing

Run the same prompt with one variable changed:
- With debug logging vs without
- Compressed instructions vs full instructions
- Different effort levels
- Different models (Sonnet vs Opus)

Measure: tokens used, time, tool uses, scorecard results.

## Scorecard

For each completed sub-agent:

```
| Check | Pass/Fail | Evidence |
|-------|-----------|----------|
| Captured /browser/traffic before writing code | | |
| Produced Transport Classification table | | |
| Used XHR/network interception (not page.evaluate) | | |
| Did NOT search for public developer APIs | | |
| curl returned real structured data | | |
| Found ALL data sources (not just the first) | | |
```

Any FAIL row = instruction gap to fix before next iteration.

## Common Failure Modes → Instruction Fixes

| Agent Behavior | Root Cause | Fix |
|----------------|-----------|------|
| Searched for public APIs | Phase 0 not restricted | Add GATE to Phase 0; ban public API search |
| Jumped to page.evaluate() | No proof requirement | Add proof prerequisite before Type B code |
| Didn't produce classification table | Gate language too soft | Add mandatory Row 0 in compliance matrix |
| Found one data source and stopped | "Don't stop" is advisory | Add interaction checklist |
| Got confused connecting browser | Architecture not explained | Add helper scripts |
| Token endpoint returned 429 | Didn't check page source first | Add token extraction priority order |

## The Fix Must Be Generalized

Every instruction change must work for ANY website, not just the one that failed. If a fix only helps for a specific site, it's overfitting. Test: would this instruction lead to the right answer on a completely different site?

**Never put specific website names, URLs, or transport classifications in instruction files.** Use generic examples (e.g., "example.com") and describe patterns, not instances.

## When to Stop

The loop converges when a fresh sub-agent (clean memory, no hints):
1. Follows the full discovery protocol without shortcuts
2. Produces the Transport Classification table before writing code
3. Uses network interception for all data extraction
4. Returns clean, structured JSON via curl
5. Discovers ALL data sources on hybrid pages

At that point, commit the instructions to `base`.
