#!/usr/bin/env bash
# PreToolUse hook — block Write/Edit to shared files when in a worktree.
#
# Agents in worktrees must NOT modify:
#   - apps/api/src/register-domains.ts
#   - apps/api/package.json
#   - pnpm-lock.yaml
#   - packages/**
#
# These files are in the main repo and contaminate other agents.
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

# Block writes to shared files (check if path points to main repo)
BLOCKED=false

# Check if the path is in the main repo (not the worktree)
if [[ -n "$PROJECT_DIR" && "$FILE_PATH" == "$PROJECT_DIR/"* ]]; then
  # Path points to main repo root — check if it's a protected file
  RELATIVE="${FILE_PATH#"$PROJECT_DIR"/}"
  case "$RELATIVE" in
    apps/api/src/register-domains.ts|apps/api/package.json|pnpm-lock.yaml)
      BLOCKED=true
      ;;
    packages/*)
      BLOCKED=true
      ;;
  esac
fi

# Also block if the relative path within the worktree targets these files
# (the tool might resolve the worktree path but the file is still wrong to modify)
case "$FILE_PATH" in
  */apps/api/src/register-domains.ts|*/apps/api/package.json|*/pnpm-lock.yaml)
    # Allow if writing within the worktree (worktree copy is OK)
    if [[ "$FILE_PATH" == "$CWD/"* ]]; then
      # Writing to worktree's own copy — this is fine for the agent's own testing
      # but we still block register-domains.ts because agents don't need it
      case "$FILE_PATH" in
        */register-domains.ts|*/pnpm-lock.yaml)
          BLOCKED=true
          ;;
      esac
    else
      BLOCKED=true
    fi
    ;;
esac

if [[ "$BLOCKED" == "true" ]]; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Worktree agents must not modify shared files (register-domains.ts, package.json, pnpm-lock.yaml). Your domain plugin is standalone — test with curl directly."
    }
  }'
  exit 0
fi

# Allow everything else
exit 0
