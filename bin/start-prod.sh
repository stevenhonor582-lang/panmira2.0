#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f dist/index.js ]; then
  echo "[start] ERROR: dist/index.js not found. Run 'npm run build' first." >&2
  exit 1
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

exec node --no-warnings=DeprecationWarning dist/index.js
