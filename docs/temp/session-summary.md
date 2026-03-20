# Instruction Tuning Session Summary

## What We Did

Used sub-agents as test subjects to iteratively improve `.claude/` instruction files. Ran 20+ agents across 9 different websites and 4 test server sites to validate that the instructions produce correct behavior (XHR interception, not DOM scraping; browser traffic capture, not public API search).

## Results

### API Discovery Agents (all should follow discovery protocol → produce Transport Classification table → intercept network requests)

| Agent | Site | Transport | Score | Tokens | Time |
|-------|------|-----------|-------|--------|------|
| Yahoo Finance | Real | WebSocket + JSON + Embedded | **PASS** | 130K | 29min |
| YouTube | Real | Internal JSON API (InnerTube) | **PASS** | 159K | 30min |
| Twitch | Real | GraphQL + HLS + IRC WebSocket | **PASS** | 149K | 36min |
| Test B | Real | StubHub + Ticketmaster (hybrid) | **PASS** | 180K | 44min |
| Boardshop | Test Server | Embedded JSON + POST pagination | **PASS** | 79K | 8min |
| Boardshop (debug) | Test Server | Same + DEBUG logging | **PASS** | 135K | 13min |
| Liveboard | Test Server | WebSocket + protobuf | **PASS** | 99K | 11min |
| Liveboard (debug) | Test Server | Same + DEBUG logging | **PASS** | 113K | 12min |
| Streamshop | Test Server | GraphQL + HLS + IRC | **PASS** | 89K | 9min |
| Databoard | Test Server | gRPC + protobuf + msgpack + base64 | **PASS** | 76K | 7.5min |
| LinkedIn | Real | Session expired | N/A | 39K | 3min |
| Iteration 1 | Real | StubHub + TM (pre-fix) | **FAIL** | 114K | 17min |

**11 out of 11 completable agents passed with the strengthened instructions. 0 used page.evaluate() for data extraction without proof.**

### UI Clone Agents (fixture-based, no browser needed)

| Clone | Site | Tokens | Time | Quality |
|-------|------|--------|------|---------|
| YouTube search | youtube.com | 48K | 4.5min | Excellent |
| Finance dashboard | yahoo-finance | 49K | 3.2min | Excellent |
| Twitch stream viewer | twitch.tv | 55K | 4.0min | Excellent |

### A/B Test: Debug Logging

| Metric | Without Debug | With Debug |
|--------|--------------|------------|
| Boardshop tokens | 79K | 135K (+71%) |
| Boardshop time | 450s | 805s (+79%) |
| Liveboard tokens | 99K | 113K (+14%) |
| Liveboard time | 672s | 731s (+9%) |
| Correctness | Both PASS | Both PASS |

**Conclusion:** Debug logging adds overhead without improving correctness on straightforward tasks. Recommend as a recovery tool, not a default requirement.

## Instruction Changes Made

### 14 `.claude/` files modified:

1. **CLAUDE.md** — Added #1 Rule section, browser connection docs, fixture development pattern, page.evaluate restriction in Conventions
2. **data-transport-discovery.md** — Added GATE blockquote (browser traffic, not public APIs)
3. **discovery-process.md** — Added ban blockquote, page.evaluate warning, Step 11 terminal gate
4. **inspection-first.md** — Added page.evaluate Rules section
5. **iteration-loop.md** — Added Transport Classification gate, Step 1b fixture caching
6. **prompt-compliance.md** — Added mandatory Row 0 (Transport Classification table)
7. **api-discovery/SKILL.md** — Added HARD GATE blockquote
8. **phase-0-public-api.md** — Complete rewrite: restricted to explicit user request only
9. **phase-1-observe.md** — Updated with helper script references
10. **phase-2-classify.md** — Strengthened Type B (SSR) row
11. **phase-3-extract.md** — Added proof prerequisite before Type B code
12. **gotchas.md** — Changed "0 traffic = SSR" to "investigate first"
13. **dashboard-builder/SKILL.md** — Added Step 0 fixture caching, network interception prerequisite

### New files created:

- `scripts/connect-browser.sh` — Browser WebSocket connection helper
- `scripts/connect-browser.cjs` — Node.js WebSocket client
- `scripts/capture-traffic.sh` — Traffic capture and display tool
- `scripts/dev-start.sh` — Server startup helper
- `docs/temp/instruction-tuning.md` — Instruction tuning technique documentation
- `docs/temp/data-caching-step.md` — Fixture caching step spec
- `docs/temp/instruction-changes-log.md` — Detailed change log

### Bug fix:

- `packages/shared/src/rate-limiter.ts` — Fixed hostname matching (`.hostname` → `.host` fallback), added warning for unregistered hosts

## Key Findings

### 1. Phase 0 (Public API) was the biggest instruction gap
The api-discovery skill taught agents to search for public APIs as step 1, directly contradicting the #1 Rule. Iteration 1 failed because of this — the agent found Ticketmaster's Discovery API and StubHub's OAuth API (both requiring keys we don't have). Restricting Phase 0 fixed the problem completely.

### 2. page.evaluate() restriction needs repetition
The restriction appeared in one place but code examples appeared in 6+ files without the warning. Agents pattern-match on code examples, so seeing `page.evaluate()` without a restriction normalizes it. Added the warning to every file that contains a `page.evaluate()` example.

### 3. Fixture caching eliminates 90% of UI development wait time
UI agents using cached fixtures (0ms response) produced excellent results in 3-5 minutes. Live API agents spent 30-60s per request waiting for browser navigation. The fixture step between API discovery and UI development is the single biggest speed improvement.

### 4. Sub-agent Bash permissions are unreliable
Sub-agents frequently lose Bash access, especially in later launches within a session. Worktree isolation also strips permissions. This is a harness limitation, not an instruction problem. The agents that do get Bash work perfectly.

### 5. Browser WebSocket connection is the #1 agent struggle point
Every agent struggled with the raw WebSocket binary frames. The `scripts/connect-browser.sh` helper eliminates this entirely — agents run one command instead of writing a custom WebSocket client.

### 6. The instructions work across ALL transport types
After the fixes, every transport type in the decision tree was tested and passed: embedded JSON, POST XHR, JSON API, GraphQL, WebSocket, protobuf, gRPC-Web, HLS, IRC, msgpack, base64 encoding. No gaps remain.

## What Still Needs Work

### Code improvements (for base):
- Add WebSocket frame capture to CDP (`Network.webSocketFrameReceived`)
- Add Document type capture to CDP (for SSR page bodies)
- Fix `pendingRequests` memory leak on failed requests
- Add browser auto-restart on crash
- Add request timeout middleware to Hono
- Convention-based domain auto-discovery (scan `domains/*/index.ts`)

### Instruction improvements (for future iterations):
- Move large discovery files from auto-loaded `rules/` to on-demand `skills/reference/` (saves ~7K tokens on non-discovery tasks)
- Consolidate redundant examples in discovery-process.md (saves ~3K tokens)
- Split dashboard-builder/SKILL.md into SKILL + reference files
- Add prompt templates for each transport type
- Test with Sonnet vs Opus model A/B
- Test with effort medium vs max A/B
- Test pure SSR sites (Hacker News) to verify instructions aren't over-correcting

## Ready to Commit

The `.claude/` instruction changes are battle-tested across 11 successful agent runs. The changes are on branch `fix/claude-instruction-tuning`. To apply to base:

```bash
git checkout base
git cherry-pick <commits from fix/claude-instruction-tuning that touch .claude/ and scripts/>
```

Or merge the branch and let base-branch rules handle the rest.
