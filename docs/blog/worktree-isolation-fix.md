# Fixing Worktree Isolation in Claude Code Sub-Agents

**TL;DR:** Claude Code's worktree isolation branches from `origin/HEAD`, not local `HEAD`. If you commit but don't push, agents get stale code. A `WorktreeCreate` hook fixes this in 15 lines of bash.

## The Problem

We're building an instruction-tuning loop: launch sub-agents in worktree isolation, score their output, fix the instructions, repeat. Simple concept. But two bugs wasted hours:

**Bug 1: Agents got old instructions.** We committed a major simplification of our `.claude/rules/` files — merged two 500-line files into one 80-line file, deleted 8 reference files. Launched 5 agents in worktrees. Every agent loaded the *deleted* files. The worktrees were on commit `8421c4c` while main was on `caefd52`.

**Bug 2: Agents contaminated the main repo.** Despite running in worktrees, agents modified `apps/api/src/register-domains.ts` and `apps/api/package.json` in the main repo. Every agent run left behind untracked `domains/airbnb/`, `domains/stubhub/`, etc. in main.

## Root Cause

### Stale commits

Worktrees branch from `origin/HEAD` (the remote default branch), not from local `HEAD`. We confirmed this by comparing commits:

```
Worktree: 8421c4c  (origin/main at launch time)
Local:    caefd52  (main — our simplification commit, unpushed)
```

This is standard git behavior — `git worktree add` defaults to branching from the remote tracking branch. The Claude Code docs confirm: "worktrees branch from the default remote branch."

Anthropic's own eval engine handles this correctly:

```python
# From claude-code-security-review/claudecode/evals/eval_engine.py
subprocess.run(['git', '-C', base_repo_path, 'worktree', 'add', '-b', eval_branch,
              worktree_path, 'FETCH_HEAD'])
```

They fetch a specific ref first, then create the worktree from `FETCH_HEAD`. The worktree gets exactly the commit they want.

### File contamination

Agents in worktrees have their `cwd` set correctly (confirmed by `pwd`), but the Write/Edit tools accept absolute paths. When an agent writes to `/Users/.../api-interceptor/apps/api/src/register-domains.ts`, that absolute path bypasses the worktree entirely and hits the main repo.

The fix here is instructional: tell agents not to modify shared files, and use `$(pwd)/` prefixed paths.

## The Fix

### WorktreeCreate Hook

Claude Code supports a `WorktreeCreate` hook that replaces the default worktree creation. The hook receives JSON with a `name` field and must print the worktree path to stdout.

`.claude/hooks/create-worktree.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
NAME="$(printf '%s' "$INPUT" | jq -r '.name')"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"

WORKTREE_DIR="$CWD/.claude/worktrees/$NAME"
BRANCH_NAME="worktree-$NAME"

# Branch from local HEAD, not origin/HEAD
git -C "$CWD" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" HEAD >&2

echo "$WORKTREE_DIR"
```

`.claude/settings.json`:

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/create-worktree.sh\""
          }
        ]
      }
    ]
  }
}
```

### Agent Instructions

Updated `.claude/agents/discovery-agent.md` with:

- "NEVER modify `apps/api/src/register-domains.ts` or `apps/api/package.json`"
- "Run `pwd` first. ALL Write/Edit paths must be relative to this directory."
- Fixed stale file references (`data-transport-discovery.md` -> `discovery.md`)

## Verification

Launched a test agent with `isolation: "worktree"`. Results:

| Check | Result |
|-------|--------|
| Worktree on latest commit (`c160921`) | PASS |
| New `discovery.md` exists | PASS |
| Old `data-transport-discovery.md` gone | PASS |
| Test file in worktree only | PASS |
| Main repo clean | PASS |

## What We Learned

1. **Always push before launching worktree agents** — or use a `WorktreeCreate` hook to branch from local `HEAD`. The hook is more reliable because it doesn't require remembering to push.

2. **Agents will modify shared files unless told not to.** The agent's instinct is to register its domain plugin in `register-domains.ts`. This is correct behavior for a non-isolated context, but in worktrees it contaminates main. Explicit prohibitions in the agent definition fix this.

3. **`WorktreeCreate` hooks are powerful.** They completely replace the default worktree creation. You could use them to:
   - Branch from any commit (local HEAD, a tag, a specific SHA)
   - Set up worktree-specific config files (like the multi-agent-swarm plugin does)
   - Use non-git VCS (SVN, Perforce) for isolation
   - Inject environment variables or `.env` files into the worktree

4. **Read Anthropic's own code.** The `claude-code-security-review` repo, `claude-agent-sdk-python`, and `claude-plugins-official` repos all have production patterns for worktree handling. Their eval engine's approach (`FETCH_HEAD`) is the gold standard for controlled worktree creation.
