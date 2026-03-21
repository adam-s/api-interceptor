# Fixing Worktree Isolation in Claude Code Sub-Agents

**TL;DR:** Claude Code's worktree isolation has three bugs: stale commits (branches from `origin/HEAD`), file path leaks (Write/Edit tools target main repo), and workspace interference (`pnpm install` creates links in main). We fixed all three with a WorktreeCreate hook, a PreToolUse guard, and external worktree paths.

## The Problem

We're building an instruction-tuning loop: launch sub-agents in worktree isolation, score their output, fix the instructions, repeat. Three bugs wasted hours:

**Bug 1: Agents got old instructions.** Worktrees branched from `origin/HEAD` (stale), not local `HEAD`. Agents loaded deleted files because origin was behind.

**Bug 2: File path leaks.** Write/Edit tools accept absolute paths. Agents writing to the main repo's `domains/` directory bypassed the worktree entirely. Every run left behind untracked domain directories in main. The PreToolUse hook we added to block this didn't fire because `$CLAUDE_PROJECT_DIR` was empty in worktree contexts.

**Bug 3: Workspace interference.** Worktrees inside the repo (`.claude/worktrees/`) were detected by `pnpm-workspace.yaml` (`domains/*`), causing `pnpm install` to create links between worktree domains and main repo `node_modules`.

## Known Claude Code Issues

These are documented bugs with open GitHub issues:

- **Issue #34437** — "Worktrees should share the same project directory." Claude Code creates separate `~/.claude/projects/` dirs for each worktree path, splitting conversation history and settings.
- **Issue #28041** — "Missing `.claude/` subdirectories in worktrees." Skills, agents, and rules directories are absent in worktree sessions.
- **Issue #28248** — "Permission scoping shows main worktree path." Evidence that path resolution favors the main repo root.
- **Issue #15044** — "@file reference autocomplete shows incorrect relative paths in git worktrees."
- **CHANGELOG fix** — "Fixed `--worktree` flag not loading skills and hooks from the worktree directory" (v2.1.81).

## The Fix (Three Parts)

### Part 1: WorktreeCreate Hook — Local HEAD + External Path

The critical insight came from Anthropic's own eval engine (`claude-code-security-review/claudecode/evals/eval_engine.py`): they create worktrees **outside** the repo at `~/code/audit/`, not inside at `.claude/worktrees/`.

`.claude/hooks/create-worktree.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
NAME="$(printf '%s' "$INPUT" | jq -r '.name')"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"

# OUTSIDE the repo — avoids pnpm workspace interference
WORKTREE_DIR="/tmp/interceptor-worktrees/$NAME"
BRANCH_NAME="worktree-$NAME"

# Clean stale worktree if exists
if [ -d "$WORKTREE_DIR" ]; then
  git -C "$CWD" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || true
  rm -rf "$WORKTREE_DIR" 2>/dev/null || true
fi

# Branch from LOCAL HEAD, not origin/HEAD
git -C "$CWD" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" HEAD >&2
echo "$WORKTREE_DIR"
```

### Part 2: PreToolUse Guard Hook — Block Writes to Main

Agents using Write/Edit with absolute paths that resolve to the main repo get denied with a helpful message showing the correct worktree path.

`.claude/hooks/guard-worktree-writes.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

# Only apply in worktrees
if [[ "$CWD" != "/tmp/interceptor-worktrees/"* ]]; then
  exit 0
fi

[[ -z "$FILE_PATH" ]] && exit 0

# Allow writes inside worktree
if [[ "$FILE_PATH" == "$CWD/"* ]]; then
  exit 0
fi

# Deny everything else
jq -n --arg cwd "$CWD" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ("WRONG PATH. Use: " + $cwd + "/")
  }
}'
```

**Important:** The hook command in `settings.json` must use the docs-recommended pattern:

```json
"command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/guard-worktree-writes.sh"
```

Not `bash "$CLAUDE_PROJECT_DIR/..."` — the `bash` prefix prevents Claude Code from injecting the env var.

### Part 3: Aggressive Instructions

Instructions alone don't prevent contamination (agents use Bash to create files, bypassing Write/Edit hooks). But they reduce it. In `CLAUDE.md`:

```markdown
## Worktree Agents — DO NOT MODIFY THE MAIN REPO

If you are running in a worktree:
- ALL files go in YOUR worktree. Never write to the original repo.
- NEVER modify register-domains.ts, package.json, or pnpm-lock.yaml
- NEVER run pnpm install
- Use $(pwd)/domains/<name>/ for all file writes
```

## What Failed Along the Way

1. **`updatedInput` redirect** — PreToolUse docs say you can rewrite `file_path` via `updatedInput`. We tried it. It didn't work in practice for Write tools. Fell back to deny + error message.

2. **`$CLAUDE_PROJECT_DIR` was empty** — Our guard hook relied on this env var to find the main repo path. It's empty in the shell but Claude Code injects it at hook execution time — only if the command string uses `"$CLAUDE_PROJECT_DIR"` directly, not inside a `bash "..."` wrapper.

3. **Internal worktrees** — Putting worktrees at `.claude/worktrees/` inside the repo caused `pnpm workspace` to detect them via `domains/*` glob. Moving worktrees to `/tmp/` eliminated this.

4. **Blocking Write/Edit but not Bash** — Agents create files via `mkdir -p && cat > file` in Bash. The PreToolUse hook for `Write|Edit` doesn't catch this. Bash commands are auto-allowed. External worktree path is the structural fix.

## Verification

| Check | Result |
|-------|--------|
| Worktree at `/tmp/interceptor-worktrees/` | PASS |
| Write to main repo path | BLOCKED |
| Write to worktree path | ALLOWED |
| Main repo clean after agent run | PASS |
| `pnpm workspace` doesn't see worktree domains | PASS |
| Worktree on latest local commit | PASS |

## Iteration History

We discovered these problems through 5 iterations of instruction tuning, running 6 agents in parallel against real websites.

**Iteration 1-2:** Worktrees inside repo at `.claude/worktrees/`. Agents contaminated main every run. Write/Edit hook didn't fire (`$CLAUDE_PROJECT_DIR` empty). `pnpm install` created workspace links.

**Iteration 3-4:** Added PreToolUse guard. Blocked Write/Edit to main, but agents used Bash (`mkdir -p && cat >`) to bypass. Still contaminated.

**Iteration 5:** Moved worktrees outside repo to `/tmp/interceptor-worktrees/`. Guard hook updated. Write to main blocked, write to worktree allowed. First clean run.

Each iteration ran 6 discovery agents in parallel against real websites covering different transport types (embedded JSON, GraphQL, WebSocket, HLS, encoded APIs). The worktree contamination was invisible in early iterations because results looked correct — agents worked in their worktrees but side-effected main via absolute paths and `pnpm install`.

## Anthropic's Own Approach

Searching Anthropic's public repos (`gh search code "worktree" --owner anthropics`) revealed consistent patterns:

**eval_engine.py** — Creates worktrees at `~/code/audit/` (external to repo). Uses `git worktree add -b <branch> <path> FETCH_HEAD` to control the exact commit. Cleans up with `git worktree remove --force` + `shutil.rmtree`.

**multi-agent-swarm plugin** — Uses `$WORKTREE_PATH` variable for all file writes (`cat > "$WORKTREE_PATH/.claude/..."`) — never relative paths.

**clean_gone.md** — Cleanup command that finds worktrees by branch name, removes them with `--force`, then deletes the branch.

**sessions.py (SDK)** — `_get_worktree_paths()` uses `git worktree list --porcelain` for detection. Worktree-aware session management.

**CHANGELOG v2.1.81** — "Fixed `--worktree` flag not loading skills and hooks from the worktree directory" — confirms this was a known bug that was fixed.

## Key Takeaways

1. **Create worktrees outside the repo.** Anthropic's eval engine does this. It prevents workspace tools, gitignore, and path resolution from interfering.

2. **`$CLAUDE_PROJECT_DIR` works, but only with the right syntax.** Use `"$CLAUDE_PROJECT_DIR"/path/to/script` directly in the command field. Don't wrap it in `bash "..."`.

3. **Instructions aren't enough.** Agents ignore "never modify X" when their workflow requires it. Structural guardrails (hooks, external paths) are necessary.

4. **PreToolUse hooks can't catch Bash file creation.** The `Write|Edit` matcher blocks tool-based writes, but agents can always use Bash to create files. External worktree paths are the structural fix because Bash commands run in the worktree cwd.

5. **Search Anthropic's repos with `gh search code`.** The `claude-code-security-review`, `claude-agent-sdk-python`, `claude-plugins-official`, and `claude-code` repos all have production patterns for worktree handling.

## References

- [GitHub Issue #34437](https://github.com/anthropics/claude-code/issues/34437) — Worktrees should share project directory
- [GitHub Issue #28041](https://github.com/anthropics/claude-code/issues/28041) — Missing .claude/ subdirectories
- [GitHub Issue #28248](https://github.com/anthropics/claude-code/issues/28248) — Permission scoping shows wrong path
- [GitHub Issue #15044](https://github.com/anthropics/claude-code/issues/15044) — @file autocomplete broken in worktrees
- [GitHub Issue #24188](https://github.com/anthropics/claude-code/issues/24188) — Session resume fails with worktree paths
- [Anthropic eval engine](https://github.com/anthropics/claude-code-security-review/blob/main/claudecode/evals/eval_engine.py) — External worktree pattern
- [Multi-agent-swarm plugin](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/plugin-settings/references/real-world-examples.md) — $WORKTREE_PATH usage
- [Claude Code hooks docs](https://code.claude.com/docs/en/hooks) — PreToolUse and WorktreeCreate reference
- [Claude Code CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) — Worktree skills/hooks fix in v2.1.81
