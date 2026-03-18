---
description: Workflow rules — verification, git hygiene, mistake logging, test-to-base flow
---

# Workflow Rules

- **Verify every step:** curl returns real data, screenshot shows real content — never move on without proof
- **Debug skill for runtime bugs:** invoke `.claude/skills/debug-logs/SKILL.md` — don't guess, observe.
- **Never quit half-way:** iterate until the prompt is fully solved and CI is green
- **Commit base clean before cutting branches:** always commit `base` to a clean, passing state BEFORE creating test branches — the branch point is permanent and cannot be retroactively fixed without rebase
- **Never `git add -A`:** stage specific files by name. `git add -A` catches `data/browser-profiles/` cache, `.env` files, and other local artifacts. Prefer dependency injection over hardcoded imports — framework code in `packages/` must be clean of domain-specific code.
- **Document mistakes immediately:** when something goes wrong, append a one-line note to `base-fixes-needed.md` describing what happened and how to avoid it. Don't wait until the end of the iteration.
- **Review skills after using them:** after completing work guided by a skill, review what went wrong and add gotchas/lessons to the skill's SKILL.md on the next base pass. Skills improve every iteration.
- **Maintain a running failure log:** during iterations, log every failure with root cause. At the end, sweep: domain-specific stays on the test branch, generalizable fixes go to base skills.

## Notes File Rule (Test -> Base)

**On a test branch, NEVER directly edit CLAUDE.md, ROADMAP.md, DEVELOPER_PROMPTS.md, or `.claude/skills/`.** Write discoveries to the persistent fix queue instead:

```text
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/base-fixes-needed.md
```

On return to `base`: read the file, apply every item, clear it, run CI, commit. The next test branch inherits all learnings.
