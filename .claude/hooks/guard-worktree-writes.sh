#!/usr/bin/env bash
# PreToolUse hook — block ALL writes to the main repo when in a worktree.
#
# If cwd is a worktree and file_path points to the main project dir
# (not the worktree), deny the write. This prevents agents from
# contaminating main with domain plugins, package.json changes, etc.
set -euo pipefail

INPUT="$(cat)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"
FILE_PATH="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-}"

# Only apply in worktrees
if [[ "$CWD" != *"/.claude/worktrees/"* ]]; then
  exit 0
fi

# No file path = not a file tool, allow
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# If the path is inside the worktree, allow it
if [[ "$FILE_PATH" == "$CWD/"* || "$FILE_PATH" == "$CWD" ]]; then
  exit 0
fi

# If the path is inside the main project dir (not the worktree), BLOCK IT
if [[ -n "$PROJECT_DIR" && "$FILE_PATH" == "$PROJECT_DIR/"* ]]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "You are in a worktree. Write to your worktree path, not the main repo. Use relative paths from your pwd."
    }
  }'
  exit 0
fi

# Allow everything else (absolute paths outside both main and worktree)
exit 0
