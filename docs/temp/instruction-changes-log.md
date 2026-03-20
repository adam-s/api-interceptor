# Instruction Changes Log — Tuning Session

All changes made to `.claude/` files during the instruction tuning session.

## Changes Applied

### CLAUDE.md
1. **Added #1 Rule section** at the very top — browser traffic interception, no public APIs, page.evaluate proof requirement
2. **Added browser connection scripts** to Quick Commands section
3. **Added fixture-based UI development** pattern to Quick Commands
4. **Added page.evaluate restriction** to Conventions section (redundant with #1 Rule, intentional — agents scan Conventions separately)

### data-transport-discovery.md
1. **Added GATE blockquote** at top — must complete protocol before writing extraction code, discovery = browser traffic not public APIs

### discovery-process.md
1. **Added ban blockquote** at top — internal endpoints via browser traffic, not public developer APIs
2. **Added page.evaluate warning** to Section 1 (Read the Page Source) — clarifying that outerHTML is the only acceptable use
3. **Added Step 11** — terminal gate requiring Transport Classification table before any code

### inspection-first.md
1. **Added page.evaluate Rules section** — allowed uses vs forbidden uses with consequence statement

### iteration-loop.md
1. **Added Transport Classification table gate** — must produce table before writing fetcher code
2. **Added Step 1b** — fixture caching gate between API routes and UI development

### prompt-compliance.md
1. **Added mandatory Row 0** — Transport Classification table produced before extraction code. FAIL invalidates all other rows.

### api-discovery/SKILL.md
1. **Added HARD GATE blockquote** — 5-step checklist (connect browser, navigate, capture traffic, read bodies, produce table) before any code

### api-discovery/reference/phase-0-public-api.md
1. **Complete rewrite of header** — Phase 0 restricted to explicit user request or completed Phases 1-2. Hard gate language. "If you don't have API keys, this phase does not apply."

### api-discovery/reference/phase-1-observe.md
1. **Replaced raw WebSocket instructions** with `./scripts/connect-browser.sh` and `./scripts/capture-traffic.sh` helper scripts

### api-discovery/reference/phase-2-classify.md
1. **Strengthened Type B (SSR) row** — added "LAST RESORT ONLY, requires proof" and validation requirements

### api-discovery/reference/phase-3-extract.md
1. **Added proof prerequisite** before Type B code section — must have classification table row with SSR evidence

### api-discovery/reference/gotchas.md
1. **Changed "0 traffic = use SSR" shortcut** to "Do NOT immediately assume SSR — investigate first"

### dashboard-builder/SKILL.md
1. **Added network interception prerequisite** in Prerequisites section
2. **Added Step 0: Cache Fixture Data** — mandatory before building any UI

## New Files Created

### scripts/connect-browser.sh
Helper script for agents to connect browser via WebSocket. Handles binary frames, keeps connection alive in background, prints ready message.

### scripts/connect-browser.cjs
Node.js WebSocket client used by connect-browser.sh.

### scripts/capture-traffic.sh
Pretty-prints captured traffic with --summary, --full, --watch, --save, --clear flags.

### docs/temp/instruction-tuning.md
Full documentation of the instruction tuning technique using sub-agents.

### docs/temp/data-caching-step.md
Spec for the fixture caching step between API discovery and UI development.

## Validation Results

| Agent | Site | Transport | Followed Protocol? | Score |
|-------|------|-----------|-------------------|-------|
| Yahoo Finance | Real | WS + JSON + Embedded | YES | PASS |
| YouTube | Real | Internal JSON API | YES | PASS |
| Twitch | Real | GQL + HLS + IRC | YES | PASS |
| Test B | Real | Hybrid (SH + TM) | YES | PASS |
| Boardshop A | Test Server | Embedded + POST | YES | PASS |
| Boardshop B | Test Server | Embedded + POST (debug) | YES | PASS |
| Liveboard C | Test Server | WS + Protobuf (debug) | YES | PASS |
| Liveboard D | Test Server | WS + Protobuf | YES | PASS |
| LinkedIn | Real | Session expired | N/A | N/A |

**8 out of 8 completable agents passed with the strengthened instructions.**
