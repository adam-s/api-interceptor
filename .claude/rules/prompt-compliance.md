---
description: Prompt Compliance Gate — produce a compliance matrix before every commit
---

# Prompt Compliance Gate

**Before committing: list every prompt requirement, state evidence for each. Any requirement without evidence = not done.**

```
## Prompt Compliance Matrix
| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 0 | Transport Classification table produced before extraction code | PASS/FAIL | Link to table in conversation |
| 1 | [from prompt] | PASS/FAIL | [curl output, screenshot, code path, or Patchright proof] |
```

**Row 0 is mandatory.** If FAIL, all other rows are invalid. The discovery protocol is a prerequisite.

- Extract requirements at START of work (Step 0a in iteration loop)
- Produce matrix BEFORE committing (Step 5 in iteration loop)
- ANY FAIL row = fix, then re-produce
- Evidence must be specific — not "implemented" or "done"
