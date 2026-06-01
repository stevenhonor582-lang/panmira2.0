#!/usr/bin/env bash
#
# check-health.sh — 健康检查（多服务）
# 输入: $1..$N = 服务列表（默认 localhost:9100/health mahubot-core:9100/health ...）
# 输出: 每行 "service=<name> status=<UP|DOWN> latency_ms=<int> http_code=<int>"
# 依赖: curl（python3 用于 JSON 解析回退）
#
set -euo pipefail

DEFAULT_SERVICES=(
  "localhost:9100/health"
  "mahubot-core:9100/health"
  "mahubot-portal:9100/health"
  "mahubot-mcp:9100/health"
  "postgres:5432"
)

if [ "$#" -eq 0 ]; then
  SERVICES=("${DEFAULT_SERVICES[@]}")
else
  SERVICES=("$@")
fi

TIMEOUT="${HEALTH_CHECK_TIMEOUT:-3}"

check_one() {
  local svc="$1"
  local name="${svc%%:*}"
  local port="${svc##*:}"
  # 去除可能的 path 部分
  local path="/health"
  case "$port" in
    *"/"*)
      path="/${port#*/}"
      port="${port%%/*}"
      ;;
  esac

  local start end latency code
  start=$(date +%s%N)
  code=$(curl -sS -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "http://${name}:${port}${path}" 2>/dev/null || echo "000")
  end=$(date +%s%N)
  latency=$(( (end - start) / 1000000 ))

  local status="DOWN"
  if [ "$code" = "200" ]; then
    status="UP"
  fi

  echo "service=${name} status=${status} latency_ms=${latency} http_code=${code}"
}

for svc in "${SERVICES[@]}"; do
  check_one "$svc"
done
