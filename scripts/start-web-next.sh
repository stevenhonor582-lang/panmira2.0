#!/bin/bash
set -e
cd /home/ubuntu/panmira-N1/apps/web-next
echo "[start-web-next] building..."
npm run build 2>&1 | tail -3
echo "[start-web-next] pm2 delete old..."
pm2 delete web-next 2>/dev/null || true
echo "[start-web-next] pm2 start new..."
cd /home/ubuntu/panmira-N1
pm2 start ecosystem.config.cjs --only web-next
echo "[start-web-next] verify..."
sleep 5
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3200/web-next/dashboard/
echo "[start-web-next] done"
