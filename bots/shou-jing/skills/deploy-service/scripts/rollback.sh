#!/usr/bin/env bash
#
# rollback.sh — 回滚到上一个稳定版本
# 输入: $1=deploy_id $2=service $3=environment
# 输出: JSON { rollback_status, target_revision, duration_ms }
#
set -euo pipefail

DEPLOY_ID="${1:-unknown}"
SERVICE="${2:-panmira-core}"
ENVIRONMENT="${3:-prod}"

START_MS=$(date +%s%3N)

# Mock: kubectl rollout undo
# kubectl rollout undo deployment/${SERVICE} -n ${ENVIRONMENT} --to-revision=<N>
# kubectl rollout status deployment/${SERVICE} -n ${ENVIRONMENT} --timeout=300s

# 健康检查
# scripts/health-check.sh http://${SERVICE}.${ENVIRONMENT}.svc/healthz

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

cat <<JSON
{
  "deploy_id": "${DEPLOY_ID}",
  "service": "${SERVICE}",
  "environment": "${ENVIRONMENT}",
  "rollback_status": "succeeded",
  "target_revision": "rev-previous-stable",
  "duration_ms": ${DURATION},
  "artifacts": {
    "previous_version": "v1.5.1",
    "current_version_after_rollback": "v1.5.1",
    "rollback_reason": "health_check_failed"
  }
}
JSON
