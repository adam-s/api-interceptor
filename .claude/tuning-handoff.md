# Instruction Tuning Handoff

## Current State: Iteration 29 running (will likely fail — same pattern as 27-28)

## The Problem (identified iter 26-29)

Agents skip browser interaction entirely. Every iteration, they:
1. Fetch HTML via `rateLimitedFetch` (Step 1b)
2. Parse embedded JSON (`__NEXT_DATA__`, `index-data`)
3. Go deep on the data they found
4. Never connect a browser, never click anything
5. Hit BUILD with no pagination traffic captured
6. Struggle to paginate because they never saw the pagination POST

**Root cause:** Step 1b gives agents permission to `rateLimitedFetch` HTML directly. This is easier than connecting a browser, so they always choose it. By the time they have HTML data, they're too invested in parsing to go back and click.

**The fix (not yet applied):** Remove `rateLimitedFetch` from GATHER. The browser is the only tool in GATHER. Merge 1b and 1c into 1a. GATHER becomes: connect browser → navigate pages → click pagination controls → capture traffic. HTML and JS bundle analysis moves to SCAN.

## Iteration History

| Site | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 |
|------|----|----|----|----|----|----|----|----|----|----|----|----|
| HN | A | A | A | A | A | A | A | A | A* | A | — | — |
| Airbnb | — | — | — | — | — | A | A | A | — | A | — | — |
| Twitch | — | — | — | — | — | A | A | A | — | A | — | — |
| YouTube | — | — | — | — | — | A- | A- | A | — | A | — | — |
| TM | B- | B- | B+ | B | A- | A- | B+ | B+ | — | B+ | stopped | stopped |
| SH | B- | B- | B | B | B+ | B+ | B+ | A- | — | B | stopped | stopped |

*Iter 25 had CLI overhead regression (113 calls vs 79)

## What Works (stable across iterations)

- Access Gap table — all agents produce it
- Core data identification — all agents name it
- Completeness check — agents report items/total
- Elimination table — all 8 rows filled
- HN, Airbnb, Twitch, YouTube — consistently A or A-

## What Fails (TM and SH specifically)

1. **Agents never click pagination controls** — 28 iterations, never once clicked "Show more" during GATHER
2. **Agents prefer rateLimitedFetch over browser** — easier, faster, returns data immediately
3. **Agents go deep before going wide** — parse embedded JSON for 30+ calls before visiting a second page
4. **Small event trap (SH)** — agent tests event with 4 listings, sees no pagination, declares complete
5. **ISMDS inconsistency (TM)** — sometimes finds the pricing API, sometimes not

## Infrastructure Issues

- tsx watcher doesn't reload domain files (wastes 10-35 calls per run)
- Server restart loops (4-8 restarts per run)
- Patchright launch conflicts with connected browser
- `?method=` endpoints return HTML without WAF cookies (SH spends 18+ calls discovering this)

## Next Step: Restructure GATHER

Remove `rateLimitedFetch` from GATHER entirely. Make the browser the only tool:

```
GATHER (one step):
1. Connect browser to the site
2. Navigate to a list page — look for pagination controls
3. Click pagination (Show more, Next, page numbers, scroll)
4. Capture the traffic that fired — this is the pagination API
5. Navigate to a detail page with many items — repeat steps 2-4
6. Capture all traffic — you now have every API the site uses

Move to SCAN:
- Parse the captured HTML for embedded JSON and transport markers
- Fetch and scan JS bundles
- Build the Access Gap table
```

## Key Commits

- `c013fb1` — general principles (interact, eliminate, test with data)
- `41bf210` — moved clicking to Step 1a
- `3d6facc` — concrete page.evaluate click example

## Tools Available

- `TaskStop` — stop running subagents by ID
- `browser-cli.sh` — CLI for browser interactions (navigate, snapshot, click, traffic)
- `/browser/mcp/*` — REST endpoints for browser control
