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

## Memory Isolation — CRITICAL

**Memory contamination invalidates results.** Sub-agents share the same memory directory. If a memory file describes a specific site's transport type, auth mechanism, or data structure, the agent doesn't need to discover it — it already knows. Your pass rate may be inflated.

**Before every sub-agent run:**

```bash
MEMORY_DIR="~/.claude/projects/<project>/memory"
BACKUP_DIR="/tmp/memory-backup"
mkdir -p "$BACKUP_DIR"
cp "$MEMORY_DIR"/*.md "$BACKUP_DIR/"

# Remove anything that mentions specific websites or transport types
ls "$MEMORY_DIR"/*.md | while read f; do
  if grep -qi "specific-site-names-here" "$f" 2>/dev/null; then
    echo "REMOVING: $(basename $f)"
    rm "$f"
  fi
done
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

Launch agents against sites with different transport patterns simultaneously:

| Transport | What it tests |
|-----------|--------------|
| Embedded JSON + XHR pagination | Hybrid discovery — does agent find BOTH sources? |
| WebSocket + protobuf | WebSocket detection — does agent check JS bundles? |
| GraphQL + HLS + WebSocket chat | Multi-protocol — does agent find all 3? |
| Encoded/protobuf responses | Decode protocol — does agent decode instead of DOM scraping? |

## A/B Testing

Run the same prompt with one variable changed:
- With debug logging vs without
- Compressed instructions vs full instructions
- Different effort levels
- Different models (Sonnet vs Opus)

Measure: tokens used, time, retry loops, correctness.

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
