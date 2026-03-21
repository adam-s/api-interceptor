#!/usr/bin/env bash
# cleanup-agents.sh — Kill all tracked agent processes and clean worktrees.
#
# Uses Anthropic's pattern: PID array + trap cleanup.
# Reads PIDs from /tmp/interceptor-agent-pids.txt (written by agents).
# Run before launching new agents to ensure clean state.
set -euo pipefail

PID_FILE="/tmp/interceptor-agent-pids.txt"

echo "=== Agent Cleanup ==="

# 1. Kill tracked PIDs from registry
if [[ -f "$PID_FILE" ]]; then
  echo "Killing tracked processes..."
  while IFS='|' read -r pid port purpose; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  Killing PID $pid (port $port, $purpose)"
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done < "$PID_FILE"
  sleep 2
  # Force kill any survivors
  while IFS='|' read -r pid port purpose; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  Force killing PID $pid"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# 2. Kill any remaining agent-related processes (safety net)
pkill -9 -f "connect-browser" 2>/dev/null || true
pkill -9 -f "patchright" 2>/dev/null || true
# DO NOT kill chrome/chromium — user's browser

# 3. Remove worktrees
rm -rf /tmp/interceptor-worktrees/ 2>/dev/null || true
if [[ -d ".claude/worktrees" ]]; then
  rm -rf .claude/worktrees/ 2>/dev/null || true
fi
git worktree prune 2>/dev/null || true

# 4. Clean untracked domains
ls domains/ 2>/dev/null | while read -r d; do
  if ! git ls-files --error-unmatch "domains/$d" > /dev/null 2>&1; then
    echo "  Removing: domains/$d"
    rm -rf "domains/$d"
  fi
done

# 5. Revert contaminated files
git checkout HEAD -- apps/api/src/register-domains.ts apps/api/package.json pnpm-lock.yaml 2>/dev/null || true

echo ""
echo "=== Verified ==="
echo "Domains: $(ls domains/)"
echo "Node: $(pgrep -f 'node.*src/index' | wc -l | tr -d ' ') processes"
echo "PID file: $(test -f "$PID_FILE" && echo "exists" || echo "removed")"
