# Workflow Rules

- Never `git add -A` — stage specific files by name
- Always run `./scripts/ci-local.sh` before committing
- Track multi-attempt difficulties: 5+ approaches = document the problem
- **Do not retry on unexpected output.** If a request returns HTML instead of JSON, a 429, or an empty response — that IS the answer. Investigate the response (check content-type, status code, response body). Do not retry the same request with minor tweaks (different headers, sleep between). Retrying wastes tool calls and never works.
- **One install, one server start.** Run `pnpm install` once. If it fails, fix the error — do not retry with different flags. Start the API server once. If the port is in use, kill it once with `lsof -ti:PORT | xargs kill 2>/dev/null`, then start. Do not loop.

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
~/.claude/projects/<project-hash>/memory/base-fixes-needed.md
```

On return to `base`: read, apply, clear, run CI, commit.
