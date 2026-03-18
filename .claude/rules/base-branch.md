---
description: Base branch accumulates all learning — test branches are disposable
---

# The Fundamental Rule: Base Accumulates All Learning

**`base` is the product. Test branches are disposable experiments.**

Every skill improvement, utility fix, documentation update, architectural insight, and framework capability MUST land on `base` — never only on a test branch. When you create a new test branch from `base`, it inherits every fix ever applied across every previous iteration. When a test branch is done, it is stripped and abandoned. Only `base` grows.

| Lives on `base` (permanent) | Lives only on test branches (ephemeral) |
| --- | --- |
| `.claude/skills/` | `domains/<name>/` — domain plugins |
| `CLAUDE.md` | Domain-specific route files |
| `docs/temp/ROADMAP.md` | Domain-specific UI pages |
| `prompts/` | `data/browser-profiles/<domain>/` |
| Framework code in `packages/` | Nav entries for domain pages |
| Shared utilities in `apps/api/src/` | `pnpm-lock.yaml` additions for domain deps |

**The invariant:** If you delete every test branch, you lose nothing of lasting value. Everything that matters — every lesson from every iteration — is on `base`.

**The consequence:** A skill or utility fix made on a test branch and NOT applied to `base` is permanently lost the moment you checkout `base` or another branch. This is the most common failure mode. Always apply fixes to `base` first, then branch.

**Where to encode learnings:** When a fix lives in a specific file, put the guard **in the code as a comment** — not in a skill doc. A warning comment next to `ignoreDefaultArgs` in `service.ts` prevents the next iteration from removing it. A paragraph in SKILL.md about the same thing gets skimmed and forgotten. **Code comments guard implementations. Skills teach generalized principles.** If you find yourself writing a SKILL.md paragraph that names a specific file, variable, or config option, that knowledge belongs in that file as a comment instead.

**Skills must be domain-agnostic.** Skills teach HOW (generalized patterns); prompts in `prompts/` teach WHAT (domain-specific details). If a skill names a specific website, API, or domain, extract that detail into the relevant prompt's "Discovery hints" section and replace with a one-line generalized statement.
