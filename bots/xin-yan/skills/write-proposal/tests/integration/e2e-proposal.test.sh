#!/usr/bin/env bash
# e2e-proposal.test.sh - write-proposal skill 端到端集成测试
# 运行: bash tests/integration/e2e-proposal.test.sh
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_ROOT="$( cd "$SCRIPT_DIR/../.." && pwd )"
SCRIPTS="$SKILL_ROOT/scripts"
FIXTURES="$SKILL_ROOT/tests/fixtures"
TMP_OUT="$(mktemp -d)"
trap 'rm -rf "$TMP_OUT"' EXIT

PY=python3

# ---------- STEP 1: outline-builder.py 生成 tech 方案大纲 ----------
echo "STEP 1: outline-builder.py 生成技术方案大纲（1500字 + 技术团队）"
OUTLINE_JSON="$TMP_OUT/outline.json"
$PY "$SCRIPTS/outline-builder.py" "技术方案" "1500字" "技术团队" > "$OUTLINE_JSON"
$PY -c "
import json
d = json.load(open('$OUTLINE_JSON'))
assert isinstance(d.get('outline'), list), f'no outline list: {d}'
assert len(d['outline']) >= 3, f'too few sections: {len(d[\"outline\"])}'
assert d.get('template_used') == 'tech-proposal.md', f'wrong template: {d.get(\"template_used\")}'
assert d.get('section_count') == len(d['outline']), 'section_count mismatch'
print(f'  -> section_count={d[\"section_count\"]}, template={d[\"template_used\"]}')
"
echo "STEP 1 OK"

# ---------- STEP 2: word-counter.py 统计 sample-draft.md 字数 ----------
echo "STEP 2: word-counter.py 统计 sample-draft.md 字数"
WORD_JSON="$TMP_OUT/words.json"
$PY "$SCRIPTS/word-counter.py" < "$FIXTURES/sample-draft.md" > "$WORD_JSON"
$PY -c "
import json
d = json.load(open('$WORD_JSON'))
assert d.get('total_chars', 0) > 0, 'empty result'
assert d.get('chinese_chars', 0) > 0, 'no chinese chars'
print(f'  -> total_chars={d[\"total_chars\"]}, chinese_chars={d[\"chinese_chars\"]}, ascii_chars={d[\"ascii_chars\"]}')
"
echo "STEP 2 OK"

# ---------- STEP 3: toc-generator.py 从 sample-draft.md 生成 TOC ----------
echo "STEP 3: toc-generator.py 从 sample-draft.md 生成 TOC"
TOC_JSON="$TMP_OUT/toc.json"
$PY "$SCRIPTS/toc-generator.py" < "$FIXTURES/sample-draft.md" > "$TOC_JSON"
$PY -c "
import json
d = json.load(open('$TOC_JSON'))
assert isinstance(d.get('toc_lines'), list), f'no toc_lines: {d}'
assert len(d['toc_lines']) >= 1, f'empty toc: {d}'
# 每行必须包含 markdown 链接格式 [text](#anchor)
import re as _re
link_re = _re.compile(r'\[.+?\]\(#.+?\)')
for line in d['toc_lines']:
    assert link_re.search(line), f'malformed toc line: {line!r}'
print(f'  -> toc lines: {len(d[\"toc_lines\"])}')
"
echo "STEP 3 OK"

# ---------- STEP 4: quality-checker.py 检查 sample-draft.md 质量 ----------
echo "STEP 4: quality-checker.py 检查 sample-draft.md 质量"
QUALITY_JSON="$TMP_OUT/quality.json"
$PY "$SCRIPTS/quality-checker.py" < "$FIXTURES/sample-draft.md" > "$QUALITY_JSON"
$PY -c "
import json
d = json.load(open('$QUALITY_JSON'))
for key in ('passed', 'score', 'issues', 'stats'):
    assert key in d, f'missing key {key} in {d}'
assert 0.0 <= d['score'] <= 1.0, f'score out of range: {d[\"score\"]}'
assert isinstance(d['issues'], list), f'issues not a list: {d[\"issues\"]}'
print(f'  -> passed={d[\"passed\"]}, score={d[\"score\"]}, issues={len(d[\"issues\"])}')
"
echo "STEP 4 OK"

# ---------- STEP 5: feishu-publisher.py mock 发布 ----------
echo "STEP 5: feishu-publisher.py mock 发布 sample-draft.md"
PUBLISH_JSON="$TMP_OUT/publish.json"
$PY "$SCRIPTS/feishu-publisher.py" "$FIXTURES/sample-draft.md" "边缘计算节点能耗优化方案" > "$PUBLISH_JSON"
$PY -c "
import json
d = json.load(open('$PUBLISH_JSON'))
assert d.get('mock') is True, f'not mock mode: {d}'
assert 'doc_url' in d and d['doc_url'].startswith('https://'), f'bad doc_url: {d}'
assert 'doc_id' in d, f'no doc_id: {d}'
assert d.get('title'), f'no title: {d}'
assert d.get('char_count', 0) > 0, f'zero char_count: {d}'
print(f'  -> doc_url={d[\"doc_url\"]}, char_count={d[\"char_count\"]}')
"
echo "STEP 5 OK"

echo ""
echo "================================"
echo "ALL 5 STEPS PASSED (e2e OK)"
echo "================================"
exit 0
