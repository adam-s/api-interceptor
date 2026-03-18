---
description: Prompt Compliance Gate — produce a compliance matrix before every commit
---

# Prompt Compliance Gate

**Before committing: list every prompt requirement, state evidence for each (curl output, screenshot, Patchright click). Any requirement without evidence = not done. Loop until all have evidence.**

This is not a suggestion — it is a structural gate. The agent must produce a **Prompt Compliance Matrix** in the conversation before committing. The matrix makes gaps self-evident: any row without evidence is an undeniable signal that work remains.

**Why this exists:** A screenshot can look correct while silently missing half the prompt's requirements. Visual QA verifies quality; the matrix verifies completeness. Without it, the agent feels "done" after screenshots and commits incomplete work.

**The matrix format (produce this in the conversation before every commit):**

```
## Prompt Compliance Matrix
| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | [from prompt] | PASS/FAIL | [curl output, screenshot path, code path, or Patchright proof] |
```

- Extract requirements at the START of work (Step 0a in the iteration loop)
- Produce the matrix BEFORE committing (Step 5 in the iteration loop)
- ANY FAIL row = go back and fix, then re-produce the matrix
- Evidence must be specific — not "implemented" or "done"
