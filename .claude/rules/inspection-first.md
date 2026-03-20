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

## page.evaluate() Rules

**Allowed:** navigation (clicking, typing), page metadata (URL, title), auth token extraction (CSRF), reading raw HTML source for embedded JSON discovery.

**Forbidden without proof:** extracting rendered text, prices, listings, or any user-visible data. Requires evidence from captured traffic that no network request carries the data. DOM extraction = 60–90s loads, locale issues, fragile parsing. Network interception = clean JSON in 1–3s.
