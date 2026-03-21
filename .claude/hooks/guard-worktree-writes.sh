#!/usr/bin/env bash
# PreToolUse hook — redirect writes from main repo to worktree.
#
# When an agent in a worktree tries to write to the main repo path,
# rewrite the file_path to the worktree equivalent. This handles:
# - Relative paths resolved against main project root
# - Absolute paths copied from documentation or other files
# - Any path that starts with MAIN_REPO/ but should be CWD/
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

# If already pointing to the worktree, allow as-is
if [[ "$FILE_PATH" == "$CWD/"* || "$FILE_PATH" == "$CWD" ]]; then
  exit 0
fi

# Derive main repo path from worktree cwd
MAIN_REPO="${CWD%%/.claude/worktrees/*}"

# If the path points to main repo, REDIRECT to worktree
if [[ "$FILE_PATH" == "$MAIN_REPO/"* ]]; then
  SUFFIX="${FILE_PATH#"$MAIN_REPO"/}"
  NEW_PATH="$CWD/$SUFFIX"

  jq -n --arg new_path "$NEW_PATH" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      permissionDecisionReason: "Redirected write from main repo to worktree",
      updatedInput: {
        file_path: $new_path
      }
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
