---
description: main is the only permanent branch — test branches are disposable
---

# Main Is the Only Branch

**`main` is the product. Test branches are disposable.**

| Lives on `main` (permanent) | Lives on test branches (ephemeral) |
|---|---|
| `.claude/skills/`, `CLAUDE.md`, `prompts/` | `domains/<name>/` — domain plugins |
| Framework code in `packages/` | Domain-specific routes, UI pages |
| Shared utilities in `apps/api/src/` | `data/browser-profiles/<domain>/` |

**The invariant:** Delete every test branch — nothing of lasting value is lost. Everything that matters is on `main`.

**Code comments guard implementations. Skills teach generalized principles.** If a fix lives in a specific file, put the guard in the code as a comment. Skills teach HOW (generalized); prompts teach WHAT (domain-specific). Skills must be domain-agnostic.
