#!/usr/bin/env bash
# start-safe.sh — compilation gate + tsx startup
# Runs TypeScript type check before starting. If compilation fails,
# the process exits immediately (PM2 won't restart loop on syntax errors).
set -euo pipefail
cd "$(dirname "$0")/.."

# Quick syntax/type check (fail fast, ~2-5s)
if ! npx tsc --noEmit --pretty false 2>/dev/null; then
  echo "[start-safe] TypeScript compilation FAILED — aborting startup" >&2
  npx tsc --noEmit --pretty true 2>&1 | tail -20 >&2
  exit 1
fi

echo "[start-safe] TypeScript compilation OK — starting tsx"
exec npx tsx --no-warnings=DeprecationWarning src/index.ts
