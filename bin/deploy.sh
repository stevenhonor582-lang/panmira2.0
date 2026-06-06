#!/usr/bin/env bash
# deploy.sh — 安全部署 Panmira
# 核心原则：永远 delete + start，不用 restart
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[deploy] 1/4 git pull..."
git pull origin main

echo "[deploy] 2/4 npm install (if needed)..."
npm ci --production --ignore-scripts 2>/dev/null || npm install --production --ignore-scripts 2>/dev/null || true

echo "[deploy] 3/4 rebuild..."
npm run build 2>/dev/null || echo "[deploy] build skipped or not configured"

echo "[deploy] 4/4 safe restart (delete + start)..."
pm2 delete panmira 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save

echo "[deploy] ✅ Done"
pm2 status
