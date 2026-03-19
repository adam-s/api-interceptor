---
description: Observation-first development — validate through observation, not assumption
---

# Inspection-First Development

**Every new file and every bug fix MUST be validated through observation, not assumption.**

Two tools make this possible:

| Tool | Purpose | When to use |
| --- | --- | --- |
| `.claude/skills/debug-logs/SKILL.md` | See exactly what code produces at runtime — inputs, outputs, branch decisions | New code: verify it does what you think. Bug fixes: confirm the root cause before changing anything. |
| `.claude/skills/visual-dev/SKILL.md` | See the actual visual output in a real browser | Any UI change: verify it renders correctly across states and viewports. |

## New File Rule

**Every new `.ts` / `.tsx` file MUST include a first-line comment pointing to the debug-logs skill:**

```typescript
// DEBUG: invoke .claude/skills/debug-logs/SKILL.md to verify runtime behavior
```

This comment is permanent — do not remove it during cleanup. It reminds you to observe before guessing. The actual `DEBUG()` function calls you add during investigation are temporary — remove them after the fix (see debug-logs skill for the full lifecycle).

## Bug Fix Rule

Before changing code to fix a bug, **invoke the debug-logs skill first**. Add `DEBUG()` calls to observe the actual runtime state, confirm the root cause, then fix. If the bug is visual, **invoke the visual-dev skill** — screenshot the broken state, fix, re-screenshot, confirm zero issues. Never commit a fix without proof that it works.

## Unexpected Output Is Information, Not Failure

Data that exists in any form can be understood. When you observe unexpected output — wrong values, encoded strings, unfamiliar formats, empty-looking responses — that is information to investigate, not a reason to abandon the approach.

Two investigation tools, depending on whose code you're looking at:
- **Our code:** Add DEBUG() calls to trace what each layer actually produces.
- **The website's code:** Follow the discovery process in `.claude/rules/discovery-process.md` — read the page source for embedded JSON, catalog tokens, interact with the page and watch traffic, read JS bundles and trace values backwards, check for WebSocket streams, map the DOM. Every step produces observable evidence.

**When stuck, enumerate before abandoning.** List every possible explanation for the unexpected behavior (encoding, localization, unit conversion, indirect references, lazy loading, pagination, protocol differences). Test each with a targeted observation. Only abandon an approach after you have evidence that it *cannot* work — not just evidence that it doesn't work *yet*.

## Agent Failure Modes — Mandatory Guards

These failure modes have caused repeated iteration failures. They are structural gates, not suggestions.

1. **Never write extraction code without observing first.** Read the page source for embedded JSON. Check `/browser/traffic` for API calls. Check JS bundles for WebSocket endpoints. Map the DOM for custom elements and data attributes. Follow `.claude/rules/discovery-process.md`. DOM scraping is the LAST resort — sites use React with dynamic class names, not static HTML tables.

2. **Never declare "done" without end-to-end proof.** "Done" means: real data flows from the source website through the API to the dashboard UI, verified by curl output or screenshots showing real data. If any step in the user journey shows empty/error results, it's NOT done.

3. **When an API returns empty/zero results, STOP and debug.** Do not guess. Do not tweak CSS selectors. Add DEBUG logs, read the output, understand WHY it's empty, then fix based on observed evidence.

4. **Use the skills — they encode lessons from previous failures.** Every skill represents a lesson learned. Skipping them guarantees repeating the same failure. Specifically:
   - **api-discovery** Phase 1 before ANY extraction code
   - **debug-logs** before ANY bug fix
   - **visual-dev** before declaring ANY UI work complete (screenshot every state with real data)
