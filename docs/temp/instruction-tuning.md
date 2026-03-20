# Instruction Tuning via Sub-Agent Testing

Use sub-agents as test subjects to iteratively improve `.claude/` instruction files. The sub-agent runs a real task, inevitably takes shortcuts, you observe the failure, fix the instructions, and re-run. The sub-agent's code is throwaway — the instruction improvements are the product.

## Why This Works

Coding agents take the path of least resistance. Written instructions compete against the agent's training to "just get it done." If `page.evaluate()` is easier than decoding XHR, the agent will use `page.evaluate()` no matter how many times you write "don't do this."

The only way to know if instructions actually work is to test them against an agent that has never seen the codebase. Reading the instructions yourself doesn't reveal gaps — you already know the intent. A fresh agent exposes every ambiguity, soft gate, and missing enforcement point.

## The Loop

```
1. Write/update .claude/ instruction files
2. Launch sub-agent with a real task prompt
3. Wait for sub-agent to complete (or fail)
4. Inspect what it did:
   - Did it follow the process you intended?
   - Where did it take shortcuts?
   - What instruction did it ignore or misinterpret?
5. Diagnose the root cause (soft language? missing gate? contradictory file?)
6. Fix the instructions — generalized, not task-specific
7. Go to step 2
```

## Setup

### Branch Strategy

Work on a branch (e.g., `fix/claude-instruction-tuning`). Instruction edits happen here. Sub-agents run in worktrees or on the same branch writing to different directories. Only merge to `base` after instructions are battle-tested.

### Memory Isolation — CRITICAL

**Memory contamination invalidates test results.** Sub-agents share the same memory directory (`~/.claude/projects/<project>/memory/`). If a memory file says "StubHub uses embedded JSON" or "Yahoo Finance crumb is in SvelteKit scripts," the agent doesn't need to discover this — it already knows. Your 100% pass rate might be 70% without the hints.

**Rules:**
1. Clear ALL domain-specific memory files **before every sub-agent run** — not just once at the start
2. Check memory **after every run** — agents can write new memory files mid-execution
3. Keep only operational memories (how to use tools, permission fixes) — delete anything that mentions a specific website's transport type, data structure, or auth mechanism
4. If you forget to clear memory and an agent passes, the result is **unverified** — you must re-run with clean memory to confirm

**Which files are safe to keep:**
- `feedback_tmp_scripts.md` — how to run scripts (operational, no domain hints)
- `feedback_subagent_bash.md` — permission fix (operational)

**Which files MUST be removed before testing:**
- Any file mentioning a specific website name (StubHub, Yahoo, Twitch, etc.)
- Any file describing transport types, data patterns, or auth mechanisms
- Any file with "discovery" findings from previous sessions
- `iteration_state.md` — contains exact transport classifications from prior runs

```bash
MEMORY_DIR="~/.claude/projects/<project>/memory"
BACKUP_DIR="/tmp/memory-backup"
mkdir -p "$BACKUP_DIR"
cp "$MEMORY_DIR"/*.md "$BACKUP_DIR/"

# Keep ONLY operational files — remove everything domain-specific
ls "$MEMORY_DIR"/*.md | while read f; do
  # Check if file mentions any website names
  if grep -qi "stubhub\|ticketmaster\|youtube\|twitch\|yahoo\|linkedin\|reddit" "$f" 2>/dev/null; then
    echo "REMOVING (domain-specific): $(basename $f)"
    rm "$f"
  fi
done

# After tuning: cp "$BACKUP_DIR"/*.md "$MEMORY_DIR/"
```

**Lesson learned:** In our first tuning session, `feedback_xhr_before_dom.md` contained "StubHub uses S/. prices from DOM extraction" and `iteration_state.md` listed exact transport types per domain. Multiple agents may have been influenced by these hints, making our pass rates optimistic. Always verify results were achieved without memory assistance.

### Prompt Design

The sub-agent prompt should:
- Describe the task clearly (what data to extract, what to build)
- NOT hint at the solution (don't say "use embedded JSON" or "decode the XHR")
- Include constraints that test the instructions ("do NOT use public APIs", "do NOT use page.evaluate() for data")
- Request proof of work ("curl output showing real data")

Example:
```
Discover the internal APIs that [website] uses to serve [data type].
Follow the discovery protocol in .claude/rules/data-transport-discovery.md.
Create a domain plugin with proxy routes. Prove each route works with curl.
Do NOT use publicly documented APIs — we don't have API keys.
Do NOT build any dashboard UI. API routes + curl proof only.
```

## Parallel Testing

### Multiple Transport Types

Launch agents against sites with different transport patterns simultaneously. Each tests different aspects of the instructions:

| Site | Transport | Tests |
|------|-----------|-------|
| Site with embedded JSON + XHR pagination | Hybrid discovery | Does agent find BOTH sources? |
| Site with WebSocket real-time data | WebSocket detection | Does agent check JS bundles for `wss://`? |
| Site with GraphQL | GQL discovery | Does agent find the `/graphql` endpoint? |
| Site with encoded/protobuf responses | Decode protocol | Does agent decode instead of falling back to DOM? |

### Reviewer Agent

Launch a read-only agent in parallel that audits the instruction files for gaps:
- Soft language ("should" instead of "MUST")
- Missing gates (no checkpoint before code-writing)
- Contradictions between files
- Code examples without restriction warnings

The reviewer's findings feed directly into instruction fixes.

### A/B Testing

Run the same prompt against two branches — one with old instructions, one with fixes. Compare:
- Did the agent follow the discovery protocol?
- Did it produce the Transport Classification table?
- Did it use network interception or DOM extraction?
- Was the data clean and structured?

## Diagnosing Failures

### Common Failure Modes

| Agent Behavior | Root Cause | Fix |
|----------------|-----------|------|
| Searched for public developer APIs | Phase 0 not restricted; prompt didn't ban it | Add GATE to Phase 0; ban public API search in prompt and CLAUDE.md |
| Jumped to `page.evaluate()` for data | No proof requirement; code examples normalize it | Add proof prerequisite before every Type B code example |
| Didn't produce Transport Classification table | Gate language too soft; no checkpoint in iteration loop | Add mandatory Row 0 in compliance matrix |
| Found one data source and stopped | "Don't stop at first source" is advisory | Add interaction checklist (click pagination, filter, sort, scroll) |
| Got confused connecting browser | Architecture not explained for sub-agents | Add concrete script examples for browser connection |
| Used wrong page (concurrent requests) | No per-domain mutex | Add domain lock in DataService |

### The Fix Must Be Generalized

Every instruction change must work for ANY website, not just the one that failed. If a fix says "look for embedded JSON in `<script>` tags on StubHub," it only helps for StubHub. If it says "search the full HTML source for `<script type='application/json'>` tags containing data values visible on the page," it works everywhere.

Test: would this instruction lead to the right answer on a completely different site?

## Scorecard

For each completed sub-agent, produce a scorecard:

```
## Agent Scorecard: [site name]
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

## Results Tracking

Keep a log of iterations with what changed and what improved:

```
## Iteration Log
| # | What Failed | Instruction Change | Result |
|---|-------------|-------------------|--------|
| 1 | Agent used Ticketmaster Discovery API (public) | Added "no public APIs" to CLAUDE.md #1 Rule, restricted Phase 0 | Agent stopped searching for public APIs |
| 2 | Agent used page.evaluate() for prices | Added proof requirement to phase-3-extract.md Type B | Agent checked traffic first |
| 3 | Agent found embedded JSON but missed pagination XHR | Added interaction checklist to discovery-process.md | Agent clicked Load More and found POST endpoint |
```

## When to Stop

The loop converges when:
1. A fresh sub-agent follows the full discovery protocol without shortcuts
2. It produces the Transport Classification table before writing any code
3. All fetchers use network interception (XHR, WebSocket, GraphQL proxy)
4. Zero `page.evaluate()` for data extraction (navigation/metadata OK)
5. curl returns clean, structured JSON with correct values
6. The agent discovers ALL data sources on hybrid pages (not just the first)

At that point, commit the instructions to `base`. Every future test branch inherits battle-tested instructions.
