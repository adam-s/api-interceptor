---
description: Base branch accumulates all learning — test branches are disposable
---

# Main Accumulates All Learning

**`main` is the product. Test branches are disposable.**

| Lives on `main` (permanent) | Lives on test branches (ephemeral) |
|---|---|
| `.claude/skills/`, `CLAUDE.md`, `prompts/` | `domains/<name>/` — domain plugins |
| Framework code in `packages/` | Domain-specific routes, UI pages |
| Shared utilities in `apps/api/src/` | `data/browser-profiles/<domain>/` |

**The invariant:** Delete every test branch — nothing of lasting value is lost. Everything that matters is on `main`.

**The consequence:** A fix on a test branch NOT applied to `main` is lost when you switch branches. Apply fixes to `main` first, then branch.

**Code comments guard implementations. Skills teach generalized principles.** If a fix lives in a specific file, put the guard in the code as a comment. Skills teach HOW (generalized); prompts teach WHAT (domain-specific). Skills must be domain-agnostic.
