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
- **The website's code:** Download JS bundles, search for string anchors (data-testid, attribute values), and trace the transformation backwards from rendered output to raw API response. See api-discovery skill "Decoding Encoded API Responses" for the full technique.

**When stuck, enumerate before abandoning.** List every possible explanation for the unexpected behavior (encoding, localization, unit conversion, indirect references, lazy loading, pagination, protocol differences). Test each with a targeted observation. Only abandon an approach after you have evidence that it *cannot* work — not just evidence that it doesn't work *yet*.
