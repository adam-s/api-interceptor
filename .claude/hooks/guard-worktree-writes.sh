#!/usr/bin/env bash
# PreToolUse hook — block ALL writes to the main repo when in a worktree.
#
# Derives main repo path from cwd (worktree path contains /.claude/worktrees/).
# Any write outside the worktree cwd is blocked.
set -euo pipefail

INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"

# Only apply in worktrees
if [[ "$CWD" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# No file path = not a file tool, allow
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# If the path is inside the worktree cwd, allow it
if [[ "$FILE_PATH" == "$CWD/"* || "$FILE_PATH" == "$CWD" ]]; then
  exit 0
fi

# Derive main repo path from worktree cwd
MAIN_REPO="${CWD%%/.claude/worktrees/*}"

# If the path is inside the main repo, BLOCK IT
if [[ "$FILE_PATH" == "$MAIN_REPO/"* ]]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "You are in a worktree. Write to your worktree path, not the main repo. Use relative paths from your pwd."
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
