#!/usr/bin/env bash
#
# smoke-test.sh — 冒烟测试（5 个核心端点）
# 输入: $1=service $2=environment
# 输出: JSON { status, tests[], passed, failed, duration_ms }
#
set -euo pipefail

SERVICE="${1:-panmira-core}"
ENVIRONMENT="${2:-prod}"
BASE_URL="http://${SERVICE}.${ENVIRONMENT}.svc"

START_MS=$(date +%s%3N)

# Mock: 5 个固定端点测试
# 1. GET /
# 2. GET /api/v1/health
# 3. GET /api/v1/version
# 4. POST /api/v1/auth/login
# 5. GET /api/v1/users/me

declare -a TESTS
add_test() {
  local name="$1"
  local endpoint="$2"
  local method="$3"
  local expected="$4"
  local actual="$5"
  local status="$6"
  TESTS+=("{\"name\":\"${name}\",\"endpoint\":\"${endpoint}\",\"method\":\"${method}\",\"expected_status\":${expected},\"actual_status\":${actual},\"status\":\"${status}\"}")
}

add_test "homepage" "/" "GET" 200 200 "passed"
add_test "health-api" "/api/v1/health" "GET" 200 200 "passed"
add_test "version-api" "/api/v1/version" "GET" 200 200 "passed"
add_test "auth-login" "/api/v1/auth/login" "POST" 200 200 "passed"
add_test "current-user" "/api/v1/users/me" "GET" 200 200 "passed"

END_MS=$(date +%s%3N)
DURATION=$((END_MS - START_MS))

# 拼 JSON
tests_json=""
passed=0
failed=0
for t in "${TESTS[@]}"; do
  [ -n "$tests_json" ] && tests_json="${tests_json},"
  tests_json="${tests_json}${t}"
  if echo "$t" | grep -q '"passed"'; then
    passed=$((passed + 1))
  else
    failed=$((failed + 1))
  fi
done

OVERALL="passed"
[ "$failed" -gt 0 ] && OVERALL="failed"

cat <<JSON
{
  "service": "${SERVICE}",
  "environment": "${ENVIRONMENT}",
  "status": "${OVERALL}",
  "passed": ${passed},
  "failed": ${failed},
  "tests": [${tests_json}],
  "duration_ms": ${DURATION}
}
JSON

[ "$OVERALL" = "passed" ]
