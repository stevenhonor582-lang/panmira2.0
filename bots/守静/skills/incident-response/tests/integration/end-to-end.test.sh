#!/usr/bin/env bash
#
# end-to-end.test.sh — incident-response skill 端到端集成测试
# 验证整个 pipeline：
#   1. 读 sample-alert.json
#   2. 跑 classify-severity
#   3. 跑 fetch-metrics / fetch-logs (mock)
#   4. 跑 check-runbook-match
#   5. 构造完整 incident JSON
#   6. 跑 format-incident-report
#   7. 验证报告包含必要字段
#
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS="$SKILL_ROOT/scripts"
FIXTURES="$SKILL_ROOT/tests/fixtures"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "=== incident-response end-to-end test ==="
echo "skill root: $SKILL_ROOT"

# 1. 读 sample alert
echo ""
echo "--- Step 1: read sample alert ---"
ALERT_FILE="$FIXTURES/sample-alert.json"
SUMMARY=$(python3 -c "import json; print(json.load(open('$ALERT_FILE'))['summary'])")
AFFECTED=$(python3 -c "import json; print(json.load(open('$ALERT_FILE'))['affected_service'])")
echo "  summary: $SUMMARY"
echo "  affected_service: $AFFECTED"

# 2. classify-severity
echo ""
echo "--- Step 2: classify-severity ---"
CLASSIFY_OUT="$TEMP_DIR/classified.json"
python3 "$SCRIPTS/classify-severity.py" < "$ALERT_FILE" > "$CLASSIFY_OUT"
SEVERITY=$(python3 -c "import json; d=json.load(open('$CLASSIFY_OUT')); print(d['severity'])")
CATEGORY=$(python3 -c "import json; d=json.load(open('$CLASSIFY_OUT')); print(d['classification']['category'])")
INCIDENT_ID=$(python3 -c "import json; d=json.load(open('$CLASSIFY_OUT')); print(d['incident_id'])")
echo "  severity: $SEVERITY"
echo "  category: $CATEGORY"
echo "  incident_id: $INCIDENT_ID"
[ "$SEVERITY" = "P0" ] || { echo "FAIL: expected P0"; exit 1; }

# 3. fetch-metrics (mock)
echo ""
echo "--- Step 3: fetch-metrics ---"
METRICS_OUT="$TEMP_DIR/metrics.json"
python3 "$SCRIPTS/fetch-metrics.py" "$AFFECTED" 5m > "$METRICS_OUT"
ERROR_RATE=$(python3 -c "import json; d=json.load(open('$METRICS_OUT')); print(d['metrics']['error_rate'])")
echo "  error_rate (mock): $ERROR_RATE"

# 4. fetch-logs (mock)
echo ""
echo "--- Step 4: fetch-logs ---"
LOGS_OUT="$TEMP_DIR/logs.json"
python3 "$SCRIPTS/fetch-logs.py" "$AFFECTED" ERROR > "$LOGS_OUT"
LOG_COUNT=$(python3 -c "import json; d=json.load(open('$LOGS_OUT')); print(d['count'])")
echo "  log count: $LOG_COUNT"
[ "$LOG_COUNT" -gt 0 ] || { echo "FAIL: no logs returned"; exit 1; }

# 5. check-runbook-match
echo ""
echo "--- Step 5: check-runbook-match ---"
RUNBOOK_OUT="$TEMP_DIR/runbook.json"
echo "$SUMMARY" | python3 "$SCRIPTS/check-runbook-match.py" > "$RUNBOOK_OUT"
MATCHED=$(python3 -c "import json; d=json.load(open('$RUNBOOK_OUT')); print(d.get('matched_name') or 'none')")
echo "  matched runbook: $MATCHED"

# 6. 构造完整 incident JSON
echo ""
echo "--- Step 6: construct full incident JSON ---"
INCIDENT_FILE="$TEMP_DIR/incident.json"
python3 - "$CLASSIFY_OUT" "$METRICS_OUT" "$RUNBOOK_OUT" > "$INCIDENT_FILE" <<'PY'
import json, sys
classified = json.load(open(sys.argv[1]))
metrics = json.load(open(sys.argv[2]))
runbook = json.load(open(sys.argv[3]))

incident = dict(classified)
incident["matched_runbook"] = runbook.get("matched_runbook")
incident["impact"] = {
    "users_affected": 5000,
    "error_rate_peak": metrics["metrics"]["error_rate"],
    "p99_ms": metrics["metrics"]["p99_ms"],
}
incident["timeline"] = [
    {"ts": "2026-06-01T10:23:00Z", "event": "告警触发", "actor": "prometheus"},
    {"ts": "2026-06-01T10:24:00Z", "event": "战时群建立", "actor": "shou-jing"},
    {"ts": "2026-06-01T10:25:00Z", "event": "oncall 通知", "actor": "shou-jing"},
]
print(json.dumps(incident, ensure_ascii=False))
PY
echo "  incident JSON constructed"

# 7. format-incident-report
echo ""
echo "--- Step 7: format-incident-report ---"
REPORT="$TEMP_DIR/report.md"
python3 "$SCRIPTS/format-incident-report.py" < "$INCIDENT_FILE" > "$REPORT"
REPORT_LINES=$(wc -l < "$REPORT")
echo "  report: $REPORT_LINES lines"
[ "$REPORT_LINES" -gt 5 ] || { echo "FAIL: report too short"; exit 1; }

# 8. 验证报告内容
echo ""
echo "--- Step 8: verify report contents ---"
for keyword in "事故报告" "P0" "影响范围" "建议动作"; do
  if grep -qF "$keyword" "$REPORT"; then
    echo "  OK: contains '$keyword'"
  else
    echo "  FAIL: missing '$keyword'"
    exit 1
  fi
done

# 9. 验证 manifest.json
echo ""
echo "--- Step 9: verify manifest.json ---"
python3 -c "import json; m=json.load(open('$SKILL_ROOT/manifest.json')); assert m['name']=='incident-response'; assert m['bot_id']=='shou-jing'; assert m['layer']==3; print('  OK: manifest valid')"

# 10. 验证 schema.json
echo ""
echo "--- Step 10: verify schema.json ---"
python3 -c "import json; s=json.load(open('$SKILL_ROOT/schema.json')); assert 'input' in s and 'output' in s; assert 'incident_id' in s['output']['required']; print('  OK: schema valid')"

# 11. 验证 SKILL.md < 500 行
echo ""
echo "--- Step 11: verify SKILL.md size ---"
SKILL_LINES=$(wc -l < "$SKILL_ROOT/SKILL.md")
echo "  SKILL.md: $SKILL_LINES lines"
[ "$SKILL_LINES" -lt 500 ] || { echo "FAIL: SKILL.md exceeds 500 lines"; exit 1; }
echo "  OK: SKILL.md under 500 lines"

# 12. 验证所有脚本可执行
echo ""
echo "--- Step 12: verify scripts executable ---"
for s in classify-severity.py check-health.sh fetch-metrics.py fetch-logs.py check-runbook-match.py format-incident-report.py; do
  if [ -x "$SCRIPTS/$s" ]; then
    echo "  OK: $s is executable"
  else
    echo "  FAIL: $s not executable"
    exit 1
  fi
done

# 13. 验证 5 个 runbook 都存在
echo ""
echo "--- Step 13: verify runbooks ---"
for rb in service-down high-error-rate database-failure network-issue security-incident; do
  if [ -f "$SKILL_ROOT/references/runbooks/$rb.md" ]; then
    LINES=$(wc -l < "$SKILL_ROOT/references/runbooks/$rb.md")
    echo "  OK: $rb.md ($LINES lines)"
  else
    echo "  FAIL: $rb.md missing"
    exit 1
  fi
done

# 14. 验证 references/ 6 个核心文件
echo ""
echo "--- Step 14: verify references ---"
for ref in severity-classification.md decision-tree.md escalation-contacts.md communication-templates.md post-mortem-template.md; do
  if [ -f "$SKILL_ROOT/references/$ref" ]; then
    echo "  OK: $ref"
  else
    echo "  FAIL: $ref missing"
    exit 1
  fi
done

echo ""
echo "=== ALL E2E TESTS PASSED ==="
