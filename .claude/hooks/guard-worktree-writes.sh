#!/usr/bin/env bash
# PreToolUse hook — deny writes to main repo from worktrees.
# Agent must use worktree-relative paths instead.
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

# If path is inside worktree cwd, allow
if [[ "$FILE_PATH" == "$CWD/"* || "$FILE_PATH" == "$CWD" ]]; then
  exit 0
fi

# Derive main repo path
MAIN_REPO="${CWD%%/.claude/worktrees/*}"

# If path points to main repo, DENY with helpful message
if [[ "$FILE_PATH" == "$MAIN_REPO/"* ]]; then
  SUFFIX="${FILE_PATH#"$MAIN_REPO"/}"
  CORRECT_PATH="$CWD/$SUFFIX"
  jq -n --arg correct "$CORRECT_PATH" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("WRONG PATH. Use: " + $correct)
    }
  }'
  exit 0
fi

exit 0
