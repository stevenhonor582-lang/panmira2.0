#!/usr/bin/env bash
# Phase 8 命名一致性审计脚本 — 每小时可由 cron 调用
set -o pipefail

export PGPASSWORD=ubuntu
PSQL="psql -h localhost -U ubuntu -d metabot -A -F'|' -t"

echo "[$(date +%H:%M:%S)] 扫描命名一致性..."

# 1) bot_configs.name vs config_json.name 一致性
echo ""
echo "── 1. bot_configs.name ↔ config_json.name ──"
$PSQL -c "
  SELECT name, remark, config_json->>'name' AS config_name,
    CASE WHEN name = config_json->>'name' THEN 'OK' ELSE 'MISMATCH' END
  FROM bot_configs
  ORDER BY name
" | grep "MISMATCH" && echo "⚠️  Mismatch detected!" || echo "✅ All consistent"

# 2) folders bot_id 覆盖率
echo ""
echo "── 2. folders.bot_id 覆盖率 ──"
MISSING=$($PSQL -c "SELECT COUNT(*) FROM folders WHERE path LIKE '/数字员工/%' AND bot_id IS NULL")
if [ "$MISSING" != "0" ]; then
  echo "⚠️  $MISSING folders missing bot_id"
else
  echo "✅ All folders have bot_id"
fi

# 3) 未知 botName (不在 bot_configs 里的)
echo ""
echo "── 3. 未知 botName 检测 ──"
$PSQL -c "
  SELECT DISTINCT SPLIT_PART(path, '/', 3) AS seg
  FROM folders
  WHERE path LIKE '/数字员工/%' 
    AND parent_id = 'a4088c37-4da2-4862-a6dd-c9dd29259fd0'
    AND SPLIT_PART(path, '/', 3) NOT IN (SELECT name FROM bot_configs UNION SELECT name||'--'||remark FROM bot_configs WHERE remark != '')
" | while read seg; do
  if [ -n "$seg" ] && [ "$seg" != "(0 rows)" ]; then
    echo "⚠️  Unknown bot segment in folders: $seg"
  fi
done
echo "  (排查完成)"

# 4) defaultWorkingDirectory 一致性
echo ""
echo "── 4. defaultWorkingDirectory 一致性 ──"
$PSQL -c "
  SELECT name, config_json->>'defaultWorkingDirectory' AS actual,
    '/home/ubuntu/workspace/' || name AS expected,
    CASE WHEN config_json->>'defaultWorkingDirectory' = '/home/ubuntu/workspace/' || name 
      THEN 'OK' ELSE 'DRIFT' END
  FROM bot_configs
  ORDER BY name
" | grep "DRIFT" && echo "⚠️  Working directory drift!" || echo "✅ All consistent"

# 5) 孤儿 agent 模板
echo ""
echo "── 5. 孤儿 agent 模板 (未被任何 bot 引用) ──"
$PSQL -c "
  SELECT a.name AS orphan_agent
  FROM agents a
  WHERE a.is_active = true
    AND a.category IS DISTINCT FROM 'test'
    AND NOT EXISTS (
      SELECT 1 FROM bot_configs bc 
      WHERE bc.config_json->>'agentId' = a.id::text
    )
  ORDER BY a.name
" | while read name; do
  if [ -n "$name" ] && [ "$name" != "(0 rows)" ]; then
    echo "⚠️  Orphan agent: $name"
  fi
done
echo "  (排查完成)"

# 6) documents bot_id 覆盖率
echo ""
echo "── 6. documents.bot_id 覆盖率 ──"
DOC_MISSING=$($PSQL -c "SELECT COUNT(*) FROM documents WHERE bot_id IS NULL")
echo "  documents missing bot_id: $DOC_MISSING (0=OK)"

# 7) 总览
echo ""
echo "═══ 扫描完成 ═══"
