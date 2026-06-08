#!/usr/bin/env bash
#
# end-to-end.test.sh — code-review skill 端到端集成测试
# 验证整个 pipeline：
#   1. 读取 fixture
#   2. 跑 diff-parser
#   3. 构造 AI 评估结果（mock）
#   4. 跑 format-report
#   5. 验证输出包含 must_fix、suggestions、severity_summary
#
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS="$SKILL_ROOT/scripts"
FIXTURES="$SKILL_ROOT/tests/fixtures"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "=== code-review end-to-end test ==="
echo "skill root: $SKILL_ROOT"

# 1. 跑 diff-parser on fixture-1 diff
echo ""
echo "--- Step 1: diff-parser on fixture 1 ---"
DIFF_OUT="$TEMP_DIR/parsed.json"
python3 "$SCRIPTS/diff-parser.py" < <(python3 -c "import json; print(json.load(open('$FIXTURES/sample-pr-1.json'))['diff'])") > "$DIFF_OUT"
FILES_COUNT=$(python3 -c "import json; d=json.load(open('$DIFF_OUT')); print(len(d))")
echo "parsed $FILES_COUNT file(s) from fixture 1"
[ "$FILES_COUNT" -ge 1 ] || { echo "FAIL: expected at least 1 file"; exit 1; }

# 2. 跑 diff-parser on fixture-2 diff
echo ""
echo "--- Step 2: diff-parser on fixture 2 ---"
DIFF_OUT2="$TEMP_DIR/parsed2.json"
python3 "$SCRIPTS/diff-parser.py" < <(python3 -c "import json; print(json.load(open('$FIXTURES/sample-pr-2.json'))['diff'])") > "$DIFF_OUT2"
FILES_COUNT2=$(python3 -c "import json; d=json.load(open('$DIFF_OUT2')); print(len(d))")
echo "parsed $FILES_COUNT2 file(s) from fixture 2"
[ "$FILES_COUNT2" -ge 2 ] || { echo "FAIL: expected at least 2 files"; exit 1; }

# 3. 构造 mock AI 评估结果
echo ""
echo "--- Step 3: construct mock AI evaluation ---"
EVAL_JSON="$TEMP_DIR/eval.json"
python3 - "$FIXTURES" "$DIFF_OUT" > "$EVAL_JSON" <<'PY'
import json, sys
fixtures_dir, diff_out = sys.argv[1], sys.argv[2]
parsed = json.load(open(diff_out))
pr1 = json.load(open(f"{fixtures_dir}/sample-pr-1.json"))

# 模拟 AI 评估：基于 diff 内容检测 SQL 注入（fixture 1 故意包含）
must_fix = []
suggestions = []
for f in parsed:
    for hunk in f.get("hunks", []):
        for ln in hunk.get("lines", []):
            if ln.get("type") == "add" and "SELECT" in ln.get("content", ""):
                must_fix.append({
                    "file": f["file"],
                    "line": hunk.get("new_start", 0),
                    "severity": "P0",
                    "message": "SQL injection: use parameterized queries",
                    "rule": "security.sql-injection",
                })
            if ln.get("type") == "add" and "def " in ln.get("content", ""):
                if "type hints" not in ln.get("content", ""):
                    suggestions.append({
                        "file": f["file"],
                        "line": hunk.get("new_start", 0),
                        "severity": "P3",
                        "message": "consider adding type hints",
                        "rule": "readability.type-hints",
                    })

total_add = sum(f.get("additions", 0) for f in parsed)
total_files = len(parsed)

eval_result = {
    "report_markdown": "",
    "must_fix": must_fix,
    "suggestions": suggestions,
    "severity_summary": {
        "P0": sum(1 for x in must_fix if x["severity"] == "P0"),
        "P1": sum(1 for x in must_fix if x["severity"] == "P1"),
        "P2": sum(1 for x in must_fix if x["severity"] == "P2"),
        "P3": sum(1 for x in suggestions if x["severity"] == "P3"),
    },
    "metadata": {
        "pr_url": pr1.get("title", "test"),
        "files_reviewed": total_files,
        "lines_changed": total_add,
        "review_duration_ms": 5000,
        "confidence": 0.85,
    },
}
print(json.dumps(eval_result, ensure_ascii=False))
PY
echo "eval JSON constructed"
cat "$EVAL_JSON" | python3 -c "import sys, json; d=json.load(sys.stdin); print('  must_fix:', len(d['must_fix']), '| suggestions:', len(d['suggestions']))"

# 4. 跑 format-report
echo ""
echo "--- Step 4: format-report ---"
REPORT="$TEMP_DIR/report.md"
python3 "$SCRIPTS/format-report.py" < "$EVAL_JSON" > "$REPORT"
REPORT_LINES=$(wc -l < "$REPORT")
echo "report: $REPORT_LINES lines"
[ "$REPORT_LINES" -gt 5 ] || { echo "FAIL: report too short"; exit 1; }

# 5. 验证输出包含必要字段
echo ""
echo "--- Step 5: verify report contents ---"
for keyword in "Code Review Report" "必改项" "建议项" "严重度总览" "P0" "P1" "P2" "P3"; do
  if grep -qF "$keyword" "$REPORT"; then
    echo "  OK: contains '$keyword'"
  else
    echo "  FAIL: missing '$keyword'"
    exit 1
  fi
done

# 6. 验证 manifest.json 存在并 valid
echo ""
echo "--- Step 6: verify manifest.json ---"
python3 -c "import json; m=json.load(open('$SKILL_ROOT/manifest.json')); assert m['name']=='code-review'; assert m['bot_id']=='bu-ying'; print('  OK: manifest valid')"

# 7. 验证 schema.json 存在并 valid
echo ""
echo "--- Step 7: verify schema.json ---"
python3 -c "import json; s=json.load(open('$SKILL_ROOT/schema.json')); assert 'input' in s and 'output' in s; print('  OK: schema valid')"

# 8. 验证 SKILL.md < 500 行
echo ""
echo "--- Step 8: verify SKILL.md size ---"
SKILL_LINES=$(wc -l < "$SKILL_ROOT/SKILL.md")
echo "  SKILL.md: $SKILL_LINES lines"
[ "$SKILL_LINES" -lt 500 ] || { echo "FAIL: SKILL.md exceeds 500 lines"; exit 1; }
echo "  OK: SKILL.md under 500 lines"

# 9. 验证所有脚本可执行
echo ""
echo "--- Step 9: verify scripts executable ---"
for s in fetch-pr.sh diff-parser.py lint-runner.sh coverage-check.py format-report.py; do
  if [ -x "$SCRIPTS/$s" ]; then
    echo "  OK: $s is executable"
  else
    echo "  FAIL: $s not executable"
    exit 1
  fi
done

echo ""
echo "=== ALL TESTS PASSED ==="
