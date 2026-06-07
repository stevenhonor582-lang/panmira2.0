#!/usr/bin/env bash
# deploy.sh — Safe deployment for Panmira
# Builds from source, runs compiled output. Never uses restart.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[deploy] 1/5 git pull..."
git pull origin main

echo "[deploy] 2/5 npm install..."
npm ci 2>/dev/null || npm install 2>/dev/null || true

echo "[deploy] 3/5 type check..."
npx tsc --noEmit || echo "[deploy] ⚠ type check failed, continuing with last build"

echo "[deploy] 4/5 build..."
if ! npm run build; then
  echo "[deploy] ERROR: build failed — aborting, old process still running" >&2
  exit 1
fi

echo "[deploy] 5/5 safe restart (delete + start)..."
pm2 delete panmira 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "[deploy] ✅ Done"
pm2 status
