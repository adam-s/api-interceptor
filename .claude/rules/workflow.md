# Workflow Rules

- Never `git add -A` — stage specific files by name
- Always run `./scripts/ci-local.sh` before committing
- Track multi-attempt difficulties: 5+ approaches = document the problem

## Process Cleanup

Clean up everything you started before finishing or switching context:

```bash
pkill -f "connect-browser"              # Browser sessions
pkill -f "tsx.*src/index"               # tsx watchers
lsof -ti:3001 | xargs kill 2>/dev/null  # API server
lsof -ti:3000 | xargs kill 2>/dev/null  # Web server
```

## Test → Base Flow

On test branches, NEVER edit CLAUDE.md or `.claude/skills/` directly. Write to the fix queue:

```
~/.claude/projects/-Users-adamsohn-Projects-api-interceptor/memory/base-fixes-needed.md
```

On return to `base`: read, apply, clear, run CI, commit.
