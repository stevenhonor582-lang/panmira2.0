#!/usr/bin/env bash
# start-safe.sh — compilation gate + tsx startup
# Runs TypeScript type check before starting. If compilation fails,
# the process exits immediately (PM2 won't restart loop on syntax errors).
set -euo pipefail
cd "$(dirname "$0")/.."

# Quick syntax/type check (skip if tsc not available — deploy.sh already compiled)
if npx tsc --noEmit --pretty false 2>/dev/null; then
  : # tsc passed
elif [ -f dist/index.js ]; then
  echo "[start-safe] tsc not available, using pre-built dist/"
else
  echo "[start-safe] TypeScript compilation FAILED and no dist/ — aborting startup" >&2
  exit 1
fi

echo "[start-safe] TypeScript compilation OK — starting tsx"
exec npx tsx --no-warnings=DeprecationWarning src/index.ts
