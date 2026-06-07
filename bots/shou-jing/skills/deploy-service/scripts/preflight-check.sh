#!/usr/bin/env bash
#
# preflight-check.sh — 部署前预检（10+ 检查项）
# 输入: $1=service $2=environment
# 输出: JSON { passed, fatal_count, warning_count, checks[] }
#
set -euo pipefail

SERVICE="${1:-panmira-core}"
ENVIRONMENT="${2:-dev}"

NOW=$(date +%s%3N)
DEPLOY_ID=$(uuidgen 2>/dev/null || echo "deploy-$(date +%s)")

# 单个检查项：echo "category|id|level|name|status|message|duration_ms"
run_check() {
  local category="$1"
  local id="$2"
  local level="$3"
  local name="$4"
  local status="$5"
  local message="$6"
  local start_ms=$7
  local end_ms
  end_ms=$(date +%s%3N)
  local duration=$((end_ms - start_ms))
  echo "${category}|${id}|${level}|${name}|${status}|${message}|${duration}"
}

declare -a RESULTS
add_result() { RESULTS+=("$1"); }

# 1. 环境检查
START=$(date +%s%3N); add_result "$(run_check environment k8s.api fatal 'K8s API 可达' passed 'mock: k8s-api.internal:6443 OK' $START)"

START=$(date +%s%3N); add_result "$(run_check environment namespace.exists fatal 'namespace 存在' passed "mock: ns=${ENVIRONMENT} exists" $START)"

# 2. 权限检查
START=$(date +%s%3N); add_result "$(run_check permission rbac.deploy fatal 'deploy RBAC' passed 'mock: deployer has deployments write' $START)"
START=$(date +%s%3N); add_result "$(run_check permission rbac.pods fatal 'pods RBAC' passed 'mock: deployer has pods read' $START)"

# 3. 资源检查
START=$(date +%s%3N); add_result "$(run_check resources cpu.quota warning 'CPU 配额' passed 'mock: 65% used' $START)"
START=$(date +%s%3N); add_result "$(run_check resources disk.space fatal '磁盘空间' passed 'mock: 12GB free' $START)"

# 4. 依赖检查
START=$(date +%s%3N); add_result "$(run_check dependency db.reachable fatal '数据库可达' passed 'mock: postgres OK' $START)"
START=$(date +%s%3N); add_result "$(run_check dependency cache.reachable fatal '缓存可达' passed 'mock: redis OK' $START)"

# 5. 制品检查
START=$(date +%s%3N); add_result "$(run_check artifact image.exists fatal '镜像存在' passed "mock: ${SERVICE} latest digest found" $START)"
START=$(date +%s%3N); add_result "$(run_check artifact secrets.complete fatal 'secrets 完整' passed 'mock: db/api-key/tls all present' $START)"

# 6. 流程合规
START=$(date +%s%3N); add_result "$(run_check compliance approval fatal '审批状态' passed "mock: approver approved for ${ENVIRONMENT}" $START)"
START=$(date +%s%3N); add_result "$(run_check compliance backup fatal '备份可用' passed "mock: last backup at $(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ')" $START)"

# 汇总
fatal=0
warning=0
checks_json=""
for r in "${RESULTS[@]}"; do
  IFS='|' read -r cat id level name status msg duration <<< "$r"
  if [ "$level" = "fatal" ] && [ "$status" = "failed" ]; then
    fatal=$((fatal + 1))
  fi
  if [ "$level" = "warning" ] && [ "$status" = "failed" ]; then
    warning=$((warning + 1))
  fi
  [ -n "$checks_json" ] && checks_json="${checks_json},"
  checks_json="${checks_json}{\"id\":\"${id}\",\"category\":\"${cat}\",\"level\":\"${level}\",\"name\":\"${name}\",\"status\":\"${status}\",\"message\":\"${msg}\",\"duration_ms\":${duration}}"
done

passed="true"
[ "$fatal" -gt 0 ] && passed="false"

cat <<JSON
{
  "deploy_id": "${DEPLOY_ID}",
  "service": "${SERVICE}",
  "environment": "${ENVIRONMENT}",
  "passed": ${passed},
  "fatal_count": ${fatal},
  "warning_count": ${warning},
  "checks": [${checks_json}]
}
JSON

[ "$fatal" -eq 0 ]
