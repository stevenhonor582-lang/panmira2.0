#!/usr/bin/env bash
#
# end-to-end.test.sh — deploy-service skill 端到端集成测试
# 验证完整 5 阶段 pipeline（preflight → build → deploy → verify → report）
#
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS="$SKILL_ROOT/scripts"
FIXTURES="$SKILL_ROOT/tests/fixtures"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "=== deploy-service end-to-end test ==="
echo "skill root: $SKILL_ROOT"

# 1. 验证 preflight
echo ""
echo "--- Step 1: preflight-check (10+ checks) ---"
PREFLIGHT_OUT="$TEMP_DIR/preflight.json"
"$SCRIPTS/preflight-check.sh" metabot-core prod > "$PREFLIGHT_OUT"
PASSED=$(python3 -c "import json; d=json.load(open('$PREFLIGHT_OUT')); print(d['passed'])")
CHECKS=$(python3 -c "import json; d=json.load(open('$PREFLIGHT_OUT')); print(len(d['checks']))")
echo "preflight passed=$PASSED, checks=$CHECKS"
[ "$PASSED" = "True" ] || { echo "FAIL: preflight not passed"; exit 1; }
[ "$CHECKS" -ge 10 ] || { echo "FAIL: expected 10+ checks, got $CHECKS"; exit 1; }

# 2. 验证 build
echo ""
echo "--- Step 2: build-artifact ---"
BUILD_OUT="$TEMP_DIR/build.json"
"$SCRIPTS/build-artifact.sh" metabot-core v1.5.2 > "$BUILD_OUT"
BUILD_STATUS=$(python3 -c "import json; d=json.load(open('$BUILD_OUT')); print(d['status'])")
BUILD_ID=$(python3 -c "import json; d=json.load(open('$BUILD_OUT')); print(d['build_id'])")
echo "build status=$BUILD_STATUS, build_id=$BUILD_ID"
[ "$BUILD_STATUS" = "succeeded" ] || { echo "FAIL: build not succeeded"; exit 1; }
[ -n "$BUILD_ID" ] || { echo "FAIL: build_id missing"; exit 1; }

# 3. 验证 deploy (canary)
echo ""
echo "--- Step 3: deploy-canary ---"
DEPLOY_OUT="$TEMP_DIR/deploy.json"
"$SCRIPTS/deploy-canary.sh" metabot-core v1.5.2 prod 10 > "$DEPLOY_OUT"
DEPLOY_STATUS=$(python3 -c "import json; d=json.load(open('$DEPLOY_OUT')); print(d['deploy_status'])")
STRATEGY=$(python3 -c "import json; d=json.load(open('$DEPLOY_OUT')); print(d['strategy'])")
FINAL_PCT=$(python3 -c "import json; d=json.load(open('$DEPLOY_OUT')); print(d['final_percentage'])")
echo "deploy status=$DEPLOY_STATUS, strategy=$STRATEGY, final=$FINAL_PCT%"
[ "$DEPLOY_STATUS" = "succeeded" ] || { echo "FAIL: deploy not succeeded"; exit 1; }
[ "$STRATEGY" = "canary" ] || { echo "FAIL: strategy mismatch"; exit 1; }
[ "$FINAL_PCT" = "100" ] || { echo "FAIL: expected 100% final, got $FINAL_PCT"; exit 1; }

# 4. 验证 health-check
echo ""
echo "--- Step 4: health-check ---"
HEALTH_OUT="$TEMP_DIR/health.json"
"$SCRIPTS/health-check.sh" http://metabot-core.prod.svc > "$HEALTH_OUT"
HEALTH_STATUS=$(python3 -c "import json; d=json.load(open('$HEALTH_OUT')); print(d['status'])")
echo "health status=$HEALTH_STATUS"
[ "$HEALTH_STATUS" = "healthy" ] || { echo "FAIL: health not healthy"; exit 1; }

# 5. 验证 smoke-test
echo ""
echo "--- Step 5: smoke-test ---"
SMOKE_OUT="$TEMP_DIR/smoke.json"
"$SCRIPTS/smoke-test.sh" metabot-core prod > "$SMOKE_OUT"
SMOKE_STATUS=$(python3 -c "import json; d=json.load(open('$SMOKE_OUT')); print(d['status'])")
SMOKE_PASSED=$(python3 -c "import json; d=json.load(open('$SMOKE_OUT')); print(d['passed'])")
echo "smoke status=$SMOKE_STATUS, passed=$SMOKE_PASSED"
[ "$SMOKE_STATUS" = "passed" ] || { echo "FAIL: smoke not passed"; exit 1; }
[ "$SMOKE_PASSED" = "5" ] || { echo "FAIL: expected 5 passed, got $SMOKE_PASSED"; exit 1; }

# 6. 构造完整 result 跑 format-deploy-report
echo ""
echo "--- Step 6: format-deploy-report ---"
RESULT_JSON="$TEMP_DIR/result.json"
python3 - "$FIXTURES" "$PREFLIGHT_OUT" "$BUILD_OUT" "$DEPLOY_OUT" "$HEALTH_OUT" "$SMOKE_OUT" > "$RESULT_JSON" <<'PY'
import json, sys
fix, pre, build, deploy, health, smoke = sys.argv[1:7]
config = json.load(open(f"{fix}/sample-deploy-config.json"))
pre_data = json.load(open(pre))
build_data = json.load(open(build))
deploy_data = json.load(open(deploy))
health_data = json.load(open(health))
smoke_data = json.load(open(smoke))

result = {
    "deploy_id": pre_data["deploy_id"],
    "status": "succeeded",
    "stages": {
        "preflight": {
            "status": "succeeded" if pre_data["passed"] else "failed",
            "duration_ms": sum(c.get("duration_ms", 0) for c in pre_data.get("checks", [])),
            "checks": pre_data.get("checks", []),
            "artifacts": {"fatal_count": pre_data.get("fatal_count", 0)}
        },
        "build": {
            "status": build_data["status"],
            "duration_ms": build_data["duration_ms"],
            "build_id": build_data["build_id"],
            "image_digest": build_data["image_digest"],
            "artifacts": build_data.get("artifacts", {})
        },
        "deploy": {
            "status": deploy_data["deploy_status"],
            "duration_ms": deploy_data["duration_ms"],
            "strategy_used": deploy_data["strategy"],
            "artifacts": deploy_data.get("artifacts", {})
        },
        "verify": {
            "status": "succeeded" if health_data["status"] == "healthy" and smoke_data["status"] == "passed" else "failed",
            "duration_ms": health_data["duration_ms"] + smoke_data["duration_ms"],
            "health_report": health_data.get("metrics", {}),
            "smoke_report": {"passed": smoke_data.get("passed", 0), "failed": smoke_data.get("failed", 0)},
            "artifacts": {}
        },
        "post": {
            "status": "succeeded",
            "duration_ms": 100,
            "artifacts": {"report_path": f"runs/2026-06-01/{pre_data['deploy_id']}/"}
        }
    },
    "deployed_url": "https://metabot-core.prod.internal",
    "rollback_available_until": "2026-06-08T22:08:00Z",
    "metadata": {
        "service": config["service"],
        "version": config["version"],
        "environment": config["environment"],
        "started_at": "2026-06-01T22:00:00Z",
        "completed_at": "2026-06-01T22:08:00Z",
        "total_duration_ms": 480000,
        "deployer": "steven",
        "approver": config.get("approver", "-"),
        "strategy_used": config.get("strategy", "rolling")
    }
}
print(json.dumps(result, ensure_ascii=False))
PY
REPORT="$TEMP_DIR/report.md"
python3 "$SCRIPTS/format-deploy-report.py" < "$RESULT_JSON" > "$REPORT"
REPORT_LINES=$(wc -l < "$REPORT")
echo "report: $REPORT_LINES lines"
[ "$REPORT_LINES" -gt 10 ] || { echo "FAIL: report too short"; exit 1; }

# 7. 验证报告内容
echo ""
echo "--- Step 7: verify report contents ---"
for keyword in "Deploy Report" "preflight" "build" "deploy" "verify" "post" "metabot-core" "v1.5.2" "[OK]" "canary"; do
  if grep -qiF "$keyword" "$REPORT"; then
    echo "  OK: contains '$keyword'"
  else
    echo "  FAIL: missing '$keyword'"
    exit 1
  fi
done

# 8. 验证 manifest.json valid
echo ""
echo "--- Step 8: verify manifest.json ---"
python3 -c "import json; m=json.load(open('$SKILL_ROOT/manifest.json')); assert m['name']=='deploy-service'; assert m['bot_id']=='shou-jing'; assert m['layer']==3; print('  OK: manifest valid')"

# 9. 验证 schema.json valid
echo ""
echo "--- Step 9: verify schema.json ---"
python3 -c "import json; s=json.load(open('$SKILL_ROOT/schema.json')); assert 'input' in s and 'output' in s; assert 'deploy_id' in s['output']['properties']; print('  OK: schema valid')"

# 10. 验证 SKILL.md < 500 行
echo ""
echo "--- Step 10: verify SKILL.md size ---"
SKILL_LINES=$(wc -l < "$SKILL_ROOT/SKILL.md")
echo "  SKILL.md: $SKILL_LINES lines"
[ "$SKILL_LINES" -lt 500 ] || { echo "FAIL: SKILL.md exceeds 500 lines"; exit 1; }
echo "  OK: SKILL.md under 500 lines"

# 11. 验证所有脚本可执行
echo ""
echo "--- Step 11: verify scripts executable ---"
for s in preflight-check.sh build-artifact.sh deploy-rolling.sh deploy-blue-green.sh deploy-canary.sh health-check.sh smoke-test.sh rollback.sh format-deploy-report.py; do
  if [ -x "$SCRIPTS/$s" ]; then
    echo "  OK: $s is executable"
  else
    echo "  FAIL: $s not executable"
    exit 1
  fi
done

# 12. 验证 references 全部存在
echo ""
echo "--- Step 12: verify references ---"
for r in preflight-checklist.md deployment-strategies.md rollback-procedures.md health-checks.md environment-configs.md approval-rules.md; do
  if [ -f "$SKILL_ROOT/references/$r" ]; then
    echo "  OK: references/$r exists"
  else
    echo "  FAIL: references/$r missing"
    exit 1
  fi
done

# 13. 验证 rollback 流程
echo ""
DEPLOY_ID=$(python3 -c "import json; print(json.load(open('$PREFLIGHT_OUT'))['deploy_id'])")
echo "--- Step 13: rollback (simulate) ---"
ROLLBACK_OUT="$TEMP_DIR/rollback.json"
"$SCRIPTS/rollback.sh" "$DEPLOY_ID" metabot-core prod > "$ROLLBACK_OUT"
ROLLBACK_STATUS=$(python3 -c "import json; d=json.load(open('$ROLLBACK_OUT')); print(d['rollback_status'])")
echo "rollback status=$ROLLBACK_STATUS"
[ "$ROLLBACK_STATUS" = "succeeded" ] || { echo "FAIL: rollback not succeeded"; exit 1; }

echo ""
echo "=== ALL TESTS PASSED ==="
