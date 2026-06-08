#!/usr/bin/env bash
#
# end-to-end.test.sh — knowledge-rag-qa skill 端到端集成测试
# 验证整个 pipeline：
#   1. 读取 fixture corpus
#   2. 跑 keyword-search
#   3. 跑 embed-search
#   4. 跑 hybrid-merge
#   5. 跑 format-answer
#   6. 验证输出含引用 + 置信度
#
set -euo pipefail

SKILL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPTS="$SKILL_ROOT/scripts"
FIXTURES="$SKILL_ROOT/tests/fixtures"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

echo "=== knowledge-rag-qa end-to-end test ==="
echo "skill root: $SKILL_ROOT"

# 1. 准备 corpus fixture
echo ""
echo "--- Step 1: load corpus fixture ---"
CORPUS="$FIXTURES/sample-corpus.json"
CHUNK_COUNT=$(python3 -c "import json; print(len(json.load(open('$CORPUS'))['chunks']))")
echo "loaded $CHUNK_COUNT chunks"
[ "$CHUNK_COUNT" -ge 5 ] || { echo "FAIL: expected at least 5 chunks"; exit 1; }

# 2. 跑 chunk-text on 一个长文档
echo ""
echo "--- Step 2: chunk-text on synthetic long doc ---"
LONG_DOC="$TEMP_DIR/long-doc.md"
cat > "$LONG_DOC" <<'MD'
# 测试文档
这是第一段内容，用来验证文档切片功能是否能正确识别 Markdown 标题边界，并将每个段落独立地切成 chunk。

这是第二段内容，用来验证段落之间的空行是否能被正确识别，作为切片点。这一段比第一段更长一些，确保长度超过 min_size 阈值。

## 子标题
这是第三段内容，包含一些细节信息。本段较长，足以独立成 chunk。包含多个句子，确保中文标点和英文单词都能被正确处理。

```python
def hello():
    return "world"
```

这是第四段内容，用来做收尾。本段也足够长，能够独立成 chunk，并且包含一些项目符号。

- 列表项 1：保持完整不被切分
- 列表项 2：保持完整不被切分
MD
CHUNK_OUT="$TEMP_DIR/chunks.json"
python3 "$SCRIPTS/chunk-text.py" --file "$LONG_DOC" --max-size 200 --overlap 20 --source-id "test-doc" > "$CHUNK_OUT"
CHUNKED_COUNT=$(python3 -c "import json; print(json.load(open('$CHUNK_OUT'))['count'])")
echo "chunked into $CHUNKED_COUNT pieces"
[ "$CHUNKED_COUNT" -ge 3 ] || { echo "FAIL: expected at least 3 chunks"; exit 1; }

# 3. 跑 keyword-search
echo ""
echo "--- Step 3: keyword-search ---"
KW_OUT="$TEMP_DIR/kw.json"
python3 "$SCRIPTS/keyword-search.py" "knowledge-rag-qa 是什么" --corpus "$CORPUS" --top-k 3 > "$KW_OUT"
KW_HITS=$(python3 -c "import json; print(len(json.load(open('$KW_OUT'))['results']))")
echo "keyword hits: $KW_HITS"
[ "$KW_HITS" -ge 1 ] || { echo "FAIL: expected at least 1 keyword hit"; exit 1; }

# 4. 跑 embed-search
echo ""
echo "--- Step 4: embed-search ---"
VEC_OUT="$TEMP_DIR/vec.json"
python3 "$SCRIPTS/embed-search.py" "knowledge-rag-qa 是什么" --corpus "$CORPUS" --top-k 3 > "$VEC_OUT"
VEC_HITS=$(python3 -c "import json; print(len(json.load(open('$VEC_OUT'))['results']))")
echo "vector hits: $VEC_HITS"
[ "$VEC_HITS" -ge 1 ] || { echo "FAIL: expected at least 1 vector hit"; exit 1; }

# 5. 跑 hybrid-merge
echo ""
echo "--- Step 5: hybrid-merge ---"
MERGED_OUT="$TEMP_DIR/merged.json"
python3 "$SCRIPTS/hybrid-merge.py" --keyword "$KW_OUT" --vector "$VEC_OUT" --top-k 5 --mode hybrid --query "knowledge-rag-qa 是什么" > "$MERGED_OUT"
MERGED_COUNT=$(python3 -c "import json; print(len(json.load(open('$MERGED_OUT'))['results']))")
CONFIDENCE=$(python3 -c "import json; print(json.load(open('$MERGED_OUT'))['confidence'])")
echo "merged: $MERGED_COUNT results, confidence: $CONFIDENCE"
[ "$MERGED_COUNT" -ge 1 ] || { echo "FAIL: expected at least 1 merged result"; exit 1; }

# 6. 跑 format-answer (高置信度)
echo ""
echo "--- Step 6: format-answer (high confidence) ---"
ANSWER_INPUT="$TEMP_DIR/answer-input.json"
python3 -c "
import json
m = json.load(open('$MERGED_OUT'))
out = {
    'query': 'knowledge-rag-qa 是什么',
    'answer': 'knowledge-rag-qa 是玄鉴的检索增强问答 skill [1]。',
    'citations': [
        {'source_id': r['source_id'], 'source_title': r.get('source_id', 'doc'),
         'chunk_text': r['chunk_text'], 'score': r['score'], 'chunk_index': r['chunk_index']}
        for r in m['results']
    ],
    'confidence': max(0.9, m['confidence']),
    'include_citations': True,
}
json.dump(out, open('$ANSWER_INPUT', 'w'), ensure_ascii=False)
"
REPORT="$TEMP_DIR/report.md"
python3 "$SCRIPTS/format-answer.py" < "$ANSWER_INPUT" > "$REPORT"
REPORT_LINES=$(wc -l < "$REPORT")
echo "report: $REPORT_LINES lines"
[ "$REPORT_LINES" -gt 3 ] || { echo "FAIL: report too short"; exit 1; }

# 7. 验证报告内容
echo ""
echo "--- Step 7: verify report contents ---"
for keyword in "knowledge-rag-qa" "**引用：**" "**置信度：**" "[1]"; do
  if grep -qF "$keyword" "$REPORT"; then
    echo "  OK: contains '$keyword'"
  else
    echo "  FAIL: missing '$keyword'"
    cat "$REPORT"
    exit 1
  fi
done

# 8. 跑 format-answer (低置信度 → no-answer 模板)
echo ""
echo "--- Step 8: format-answer (low confidence → no-answer) ---"
LOW_INPUT="$TEMP_DIR/low-input.json"
python3 -c "
import json
json.dump({'query': '无关问题', 'answer': '', 'citations': [], 'confidence': 0.3},
          open('$LOW_INPUT', 'w'), ensure_ascii=False)
"
NO_ANSWER="$TEMP_DIR/no-answer.md"
python3 "$SCRIPTS/format-answer.py" < "$LOW_INPUT" > "$NO_ANSWER"
if grep -qF "知识库中暂无" "$NO_ANSWER"; then
  echo "  OK: no-answer template returned"
else
  echo "  FAIL: expected no-answer template"
  cat "$NO_ANSWER"
  exit 1
fi

# 9. 验证 manifest.json
echo ""
echo "--- Step 9: verify manifest.json ---"
python3 -c "
import json
m = json.load(open('$SKILL_ROOT/manifest.json'))
assert m['name'] == 'knowledge-rag-qa', f'wrong name: {m[\"name\"]}'
assert m['bot_id'] == 'xuan-jian', f'wrong bot_id: {m[\"bot_id\"]}'
assert m['layer'] == 2, f'wrong layer: {m[\"layer\"]}'
print('  OK: manifest valid (name=%s, bot=%s, layer=%s)' % (m['name'], m['bot_id'], m['layer']))
"

# 10. 验证 schema.json
echo ""
echo "--- Step 10: verify schema.json ---"
python3 -c "
import json
s = json.load(open('$SKILL_ROOT/schema.json'))
assert 'query' in s['input']['properties']
assert 'answer' in s['output']['properties']
assert 'citations' in s['output']['properties']
assert 'confidence' in s['output']['properties']
assert 'metadata' in s['output']['properties']
print('  OK: schema valid')
"

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
for s in chunk-text.py keyword-search.py embed-search.py hybrid-merge.py format-answer.py; do
  if [ -x "$SCRIPTS/$s" ]; then
    echo "  OK: $s is executable"
  else
    echo "  FAIL: $s not executable"
    exit 1
  fi
done

echo ""
echo "=== ALL TESTS PASSED ==="
