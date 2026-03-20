---
description: Workflow rules — verification, git hygiene, mistake logging, test-to-base flow
---

# Workflow Rules

- **Verify every step:** curl returns real data, screenshot shows real content — never move on without proof
- **Debug skill for runtime bugs:** don't guess, observe
- **Never quit half-way:** iterate until the prompt is fully solved and CI is green
- **Commit base clean before cutting branches:** the branch point is permanent
- **Never `git add -A`:** stage specific files by name
- **Document mistakes immediately:** append to `base-fixes-needed.md`, don't wait
- **Track multi-attempt difficulties:** 5+ approaches = document the problem and resolution

## Process Cleanup

**Clean up everything you started.** Kill all processes and remove temp files before finishing or switching context.

```bash
pkill -f "connect-browser"              # Browser sessions
pkill -f "tsx.*src/index"               # tsx watchers (respawn children — kill parent too)
lsof -ti:3001 | xargs kill 2>/dev/null  # API server
lsof -ti:3000 | xargs kill 2>/dev/null  # Web server
pkill -f "node /tmp/"                   # Temp node scripts
rm -f /tmp/*.cjs /tmp/*.ts              # Temp files you created
```

## Notes File Rule (Test → Base)

On test branches, NEVER edit CLAUDE.md or `.claude/skills/` directly. Write to the fix queue:

```
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/base-fixes-needed.md
```

On return to `base`: read, apply, clear, run CI, commit.
