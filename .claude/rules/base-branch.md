---
description: Base branch accumulates all learning — test branches are disposable
---

# Base Accumulates All Learning

**`base` is the product. Test branches are disposable.**

| Lives on `base` (permanent) | Lives on test branches (ephemeral) |
|---|---|
| `.claude/skills/`, `CLAUDE.md`, `prompts/` | `domains/<name>/` — domain plugins |
| Framework code in `packages/` | Domain-specific routes, UI pages |
| Shared utilities in `apps/api/src/` | `data/browser-profiles/<domain>/` |

**The invariant:** Delete every test branch — nothing of lasting value is lost. Everything that matters is on `base`.

**The consequence:** A fix on a test branch NOT applied to `base` is lost when you switch branches. Apply fixes to `base` first, then branch.

**Code comments guard implementations. Skills teach generalized principles.** If a fix lives in a specific file, put the guard in the code as a comment. Skills teach HOW (generalized); prompts teach WHAT (domain-specific). Skills must be domain-agnostic.
