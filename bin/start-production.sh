#!/usr/bin/env bash
# start-production.sh — run from compiled dist/ output
# No tsc, no tsx. Deploy script handles build before this runs.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/index.js ]; then
  echo "[start-production] ERROR: dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

exec node --no-warnings=DeprecationWarning dist/index.js
