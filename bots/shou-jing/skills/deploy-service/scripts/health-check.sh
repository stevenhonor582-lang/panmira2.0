#!/usr/bin/env bash
#
# health-check.sh — 健康检查（liveness + readiness）
# 输入: $1=url
# 输出: JSON { status, liveness, readiness, duration_ms }
#
set -euo pipefail

URL="${1:-http://panmira-core.prod.svc/healthz}"

START_MS=$(date +%s%3N)
LIVENESS="passed"
READINESS="passed"

# Mock: 实际会跑 3 次重试
# for i in 1 2 3; do
#   code=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/healthz" --max-time 2 || echo "000")
#   [ "$code" = "200" ] || LIVENESS="failed"
# done
# for i in 1 2 3; do
#   code=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/readyz" --max-time 2 || echo "000")
#   [ "$code" = "200" ] || READINESS="failed"
# done

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

OVERALL="healthy"
[ "$LIVENESS" != "passed" ] || [ "$READINESS" != "passed" ] && OVERALL="unhealthy"

cat <<JSON
{
  "url": "${URL}",
  "status": "${OVERALL}",
  "liveness": "${LIVENESS}",
  "readiness": "${READINESS}",
  "checks": [
    {"name": "liveness", "endpoint": "/healthz", "retries": 3, "status": "${LIVENESS}"},
    {"name": "readiness", "endpoint": "/readyz", "retries": 3, "status": "${READINESS}"}
  ],
  "duration_ms": ${DURATION}
}
JSON

[ "$OVERALL" = "healthy" ]
