---
name: instruction-tuning
description: Use sub-agents as test subjects to iteratively improve .claude/ instruction files. Run agent → inspect → fix instructions → re-run until agents follow the protocol correctly without hints.
---

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

## Contamination Isolation — CRITICAL

**Any prior discovery artifacts invalidate results.** Sub-agents can read everything on disk. Two contamination sources:

### 1. Memory files
If a memory file describes a specific site's transport type, auth mechanism, or data structure, the agent doesn't need to discover it — it already knows.

### 2. Domain plugin directories
Sub-agents leave `domains/<site>/` directories with complete route implementations, transport classifications, and auth token extraction code. A fresh agent can `ls domains/` and read the answer. **Clean `domains/` before every test run.**

```bash
# Remove sub-agent domain artifacts (keep only committed reference examples)
ls domains/ | while read d; do
  if ! git ls-files --error-unmatch "domains/$d" > /dev/null 2>&1; then
    echo "REMOVING untracked domain: $d"
    rm -rf "domains/$d"
  fi
done
```

**Before every sub-agent run:**

```bash
# IMPORTANT: Only target THIS project's memory, not other projects
MEMORY_DIR="$HOME/.claude/projects/$(pwd | tr '/' '-' | sed 's/^-//')/memory"
BACKUP_DIR="/tmp/memory-backup-$(basename $(pwd))"
mkdir -p "$BACKUP_DIR"
cp "$MEMORY_DIR"/*.md "$BACKUP_DIR/" 2>/dev/null

# Remove files with domain-specific content (transport types, auth details, site names)
# Keep: operational files (tool usage, permission fixes, effort level)
for f in "$MEMORY_DIR"/*.md; do
  [ "$(basename "$f")" = "MEMORY.md" ] && continue  # Never delete the index
  content=$(cat "$f" 2>/dev/null)
  # Check if file contains discovery findings, transport types, or domain-specific patterns
  if echo "$content" | grep -qiE "transport|embedded.json|websocket|graphql|crumb|csrf|XHR|DOM extraction|page\.evaluate|SSR|protobuf"; then
    echo "REMOVING (domain-specific): $(basename $f)"
    rm "$f"
  fi
done

# Restore after tuning: cp "$BACKUP_DIR"/*.md "$MEMORY_DIR/"
```

**After every run:** Check if the agent wrote new memory files. Remove any with domain-specific hints before the next test.

**Safe to keep:** operational memories (how to use tools, permission fixes). **Must remove:** anything naming specific websites, transport types, auth mechanisms, or discovery findings.

## Prompt Design

The sub-agent prompt should:
- Describe the task clearly (what data to extract, what to build)
- NOT hint at the solution (don't mention specific transport types)
- Include constraints that test the instructions ("do NOT use public APIs", "do NOT use page.evaluate() for data")
- Request proof of work ("curl output showing real data")

```
Discover the internal APIs that [website] uses to serve [data type].
Follow the discovery protocol in .claude/rules/data-transport-discovery.md.
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
