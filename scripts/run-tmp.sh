#!/usr/bin/env bash
# Run a TypeScript or Python script from /tmp with access to project dependencies.
#
# Usage:
#   ./scripts/run-tmp.sh /tmp/my-script.ts          # TypeScript (runs via tsx from packages/browser)
#   ./scripts/run-tmp.sh /tmp/my-script.py           # Python
#   ./scripts/run-tmp.sh /tmp/my-script.ts --timeout 30  # Pass args through
#
# TypeScript scripts can import from the project:
#   import { chromium } from 'patchright';
#   import { DEBUG } from '@interceptor/shared';

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

FILE="$1"
shift

case "$FILE" in
  *.ts|*.tsx)
    # pnpm strict isolation requires the script to be inside the package
    # Copy to packages/browser, run, then clean up
    BASENAME="$(basename "$FILE")"
    cp "$FILE" "$PROJECT_DIR/packages/browser/_tmp_${BASENAME}"
    cd "$PROJECT_DIR/packages/browser"
    npx tsx "_tmp_${BASENAME}" "$@"
    EXIT_CODE=$?
    rm -f "_tmp_${BASENAME}"
    exit $EXIT_CODE
    ;;
  *.py)
    exec python3 "$FILE" "$@"
    ;;
  *.js|*.cjs|*.mjs)
    cd "$PROJECT_DIR"
    exec node "$FILE" "$@"
    ;;
  *)
    echo "Unknown file type: $FILE"
    echo "Supported: .ts, .tsx, .py, .js, .cjs, .mjs"
    exit 1
    ;;
esac
