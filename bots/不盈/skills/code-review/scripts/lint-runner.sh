#!/usr/bin/env bash
#
# lint-runner.sh — 检测项目类型并跑对应 linter
# 输入: $1 = 逗号分隔的 changed files 列表（可选；缺省 = 当前目录全量）
# 输出: JSON { linter, results: [{ file, line, severity, rule, message }] }
# 支持: eslint (TS/JS) / flake8 (Python) / golangci-lint (Go)
# 优雅降级: linter 缺失 → results=[]，不视为失败
#
set -euo pipefail

CHANGED_FILES="${1:-}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

# 把文件按扩展名分类
ts_files=()
py_files=()
go_files=()
other_files=()

if [ -n "$CHANGED_FILES" ]; then
  IFS=',' read -ra RAW_FILES <<< "$CHANGED_FILES"
  for f in "${RAW_FILES[@]}"; do
    f=$(echo "$f" | xargs)  # trim
    [ -z "$f" ] && continue
    case "$f" in
      *.ts|*.tsx|*.js|*.jsx) ts_files+=("$f") ;;
      *.py) py_files+=("$f") ;;
      *.go) go_files+=("$f") ;;
      *) other_files+=("$f") ;;
    esac
  done
fi

results_json="[]"
linter="unknown"

run_eslint() {
  if [ ${#ts_files[@]} -eq 0 ]; then return; fi
  if ! command -v npx >/dev/null 2>&1; then
    echo "warn: npx not found, skipping eslint" >&2
    return
  fi
  if [ ! -f "$PROJECT_DIR/package.json" ]; then return; fi
  linter="eslint"
  local out
  out=$(cd "$PROJECT_DIR" && npx --no-install eslint --format json "${ts_files[@]}" 2>/dev/null || true)
  if [ -n "$out" ] && [ "$out" != "[]" ]; then
    # eslint JSON 格式: [{ filePath, messages: [{ line, severity, ruleId, message }] }]
    results_json=$(echo "$out" | python3 -c "
import sys, json
data = json.load(sys.stdin)
out = []
for f in data:
    fp = f.get('filePath', '')
    for m in f.get('messages', []):
        sev_map = {1: 'warning', 2: 'error'}
        out.append({
            'file': fp,
            'line': m.get('line', 0),
            'severity': sev_map.get(m.get('severity', 1), 'warning'),
            'rule': m.get('ruleId') or 'unknown',
            'message': m.get('message', ''),
        })
print(json.dumps(out, ensure_ascii=False))
")
  fi
}

run_flake8() {
  if [ ${#py_files[@]} -eq 0 ]; then return; fi
  if ! command -v flake8 >/dev/null 2>&1; then
    echo "warn: flake8 not found, skipping python lint" >&2
    return
  fi
  linter="flake8"
  local out
  out=$(cd "$PROJECT_DIR" && flake8 --format='{"file":"%(path)s","line":%(row)d,"col":%(col)d,"code":"%(code)s","message":"%(text)s"}' "${py_files[@]}" 2>/dev/null || true)
  if [ -n "$out" ]; then
    results_json=$(echo "$out" | python3 -c "
import sys, json
out = []
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        obj = json.loads(line)
        out.append({
            'file': obj['file'],
            'line': obj['line'],
            'severity': 'error' if obj['code'].startswith(('E', 'F')) else 'warning',
            'rule': obj['code'],
            'message': obj['message'],
        })
    except json.JSONDecodeError:
        pass
print(json.dumps(out, ensure_ascii=False))
")
  fi
}

run_golangci() {
  if [ ${#go_files[@]} -eq 0 ]; then return; fi
  if ! command -v golangci-lint >/dev/null 2>&1; then
    echo "warn: golangci-lint not found, skipping go lint" >&2
    return
  fi
  linter="golangci-lint"
  local out
  out=$(cd "$PROJECT_DIR" && golangci-lint run --out-format=json "${go_files[@]}" 2>/dev/null || true)
  if [ -n "$out" ]; then
    results_json=$(echo "$out" | python3 -c "
import sys, json
data = json.load(sys.stdin)
out = []
for issue in data.get('Issues', []):
    sev = issue.get('Severity', '').lower()
    out.append({
        'file': issue.get('Pos', {}).get('Filename', ''),
        'line': issue.get('Pos', {}).get('Line', 0),
        'severity': 'error' if sev in ('error', 'high') else 'warning',
        'rule': issue.get('FromLinter', 'unknown'),
        'message': issue.get('Text', ''),
    })
print(json.dumps(out, ensure_ascii=False))
")
  fi
}

# 按优先级跑（一个项目通常只属于一种 linter，但允许多个）
run_eslint
es_results="$results_json"
results_json="[]"
run_flake8
py_results="$results_json"
results_json="[]"
run_golangci
go_results="$results_json"

# 合并
python3 - "$es_results" "$py_results" "$go_results" <<'PY'
import sys, json
all_results = []
for s in sys.argv[1:4]:
    try:
        all_results.extend(json.loads(s))
    except json.JSONDecodeError:
        pass
print(json.dumps({"linter": "multi", "results": all_results}, ensure_ascii=False, indent=2))
PY
