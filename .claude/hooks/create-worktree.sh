#!/usr/bin/env bash
# WorktreeCreate hook — branches from LOCAL HEAD, not origin/HEAD.
#
# Default Claude Code behavior branches worktrees from origin/HEAD,
# which means unpushed commits are not visible to agents. This hook
# creates worktrees from the current local HEAD instead.
set -euo pipefail

INPUT="$(cat)"
NAME="$(printf '%s' "$INPUT" | jq -r '.name')"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd')"

WORKTREE_DIR="$CWD/.claude/worktrees/$NAME"
BRANCH_NAME="worktree-$NAME"

# Create worktree from local HEAD (not origin/HEAD)
git -C "$CWD" worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" HEAD >&2

# Output the worktree path (only thing on stdout)
echo "$WORKTREE_DIR"
