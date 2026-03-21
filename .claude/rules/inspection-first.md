---
description: Observation-first development — validate through observation, not assumption
---

# Inspection-First Development

**Observe before guessing. Every new file and every bug fix MUST be validated through observation.**

## Tools

| When | Tool |
|------|------|
| Runtime behavior | `debug-logs` skill — add `DEBUG()` calls, read `/tmp/interceptor-debug/` |
| Visual output | `visual-dev` skill — screenshot, judge, fix, re-screenshot |

## Rules

- Every new `.ts`/`.tsx` file: `// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior` as first line (permanent).
- Before fixing a bug: add `DEBUG()` → observe actual state → confirm root cause → THEN fix. Never commit without proof.
- Before declaring UI done: screenshot every state with real data.
- When an API returns empty: STOP. Debug logs, not guesswork.

## Unexpected Output Is Information

Wrong values, encoded strings, empty responses — investigate, don't abandon. Enumerate possible explanations (encoding, localization, lazy loading, pagination). Test each with a targeted observation. Only abandon after evidence it *cannot* work.

## Agent Failure Modes — Mandatory Guards

These failure modes have caused repeated iteration failures. They are structural gates, not suggestions.

1. **Never write extraction code without observing first.** Read the page source for embedded JSON. Check `/browser/traffic` for API calls. Check JS bundles for WebSocket endpoints. Map the DOM for custom elements and data attributes. Follow `.claude/rules/discovery-process.md`. DOM scraping is the LAST resort.

2. **Never stop at the first data source.** Finding one data source is step 1, not the end. You must also discover: additional data types the prompt requires, pagination APIs, real-time endpoints, and filtering mechanisms. Each data type visible on the page or requested by the prompt needs its own classification row.

3. **Never declare "done" without end-to-end proof.** "Done" means: real data flows from the source website through the API, verified by curl output showing real data. If any data type the prompt asks for is missing, it's NOT done.

4. **When an API returns empty/zero results, STOP and debug.** Do not guess. Do not tweak CSS selectors. Add DEBUG logs, read the output, understand WHY it's empty, then fix based on observed evidence.

## Implementation Escalation — Lightest First

Every route must use the lightest working approach. Test each level before escalating:

1. **`rateLimitedFetch`** — direct HTTP. Test every discovered endpoint with curl first. If it returns data, use this. Most endpoints work without a browser.
2. **`browserFetch`** — browser TLS + cookies. Use only if direct HTTP returns 429, 403, or a WAF challenge page. Same server-side processing, just routed through Chrome's network stack.
3. **`page.evaluate(fetch(...))`** — **NEVER use this.** It does the same thing as `browserFetch` but runs inside the browser page context, consuming memory and blocking the page. Replace with `browserFetch` in every case.
4. **`page.evaluate` for DOM extraction** — last resort. Requires proof from the Transport Classification table that no network request carries the data.

## page.evaluate() Rules

**Allowed:** navigation (clicking, typing), page metadata (URL, title), auth token extraction (CSRF), reading raw HTML source for embedded JSON discovery.

**Forbidden:** `page.evaluate(fetch(...))` — use `browserFetch` instead. Extracting rendered text, prices, listings, or any user-visible data — requires SSR proof from classification table.
