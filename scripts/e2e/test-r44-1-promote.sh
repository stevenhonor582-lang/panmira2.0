#!/usr/bin/env bash
# R44-1 提升为模板 e2e 验证脚本
# 用法: TO K=<your-jwt-or-opaque-token> ./scripts/e2e/test-r44-1-promote.sh
# 期望:templates +1 / instances 不变 / bot_configs.agent_id 已解绑
set -euo pipefail
API="${API:-http://localhost:9100}"
DB="PGPASSWORD=ubuntu psql -h localhost -U ubuntu -d metabot"

# 1. 拿一个 instance id(用绑定 bot 最多的那个,验证解绑效果)
INSTANCE_ID=$($DB -t -A -c "SELECT id FROM agent_instances WHERE id IN (SELECT agent_id FROM bot_configs WHERE agent_id IS NOT NULL) LIMIT 1")
if [ -z "$INSTANCE_ID" ]; then
  echo "NO_INSTANCE_WITH_BOTS"; exit 1
fi
echo "=== 选定的 instance: $INSTANCE_ID ==="

# 2. 拿它的当前 name
INST_NAME=$($DB -t -A -c "SELECT name FROM agent_instances WHERE id = '$INSTANCE_ID'")
echo "=== instance.name: $INST_NAME ==="

# 3. promote 前 DB 状态
echo "=== BEFORE ==="
$DB -c "SELECT count(*) AS templates FROM agent_templates;"
$DB -c "SELECT count(*) AS instances FROM agent_instances;"
$DB -c "SELECT count(*) AS bots_bound FROM bot_configs WHERE agent_id = '$INSTANCE_ID';"

# 4. 调端点
NEW_NAME="${INST_NAME}-R44TEST"
echo "=== POST $API/api/v2/admin/agent-instances/$INSTANCE_ID/promote-to-template ==="
curl -s -w "HTTP=%{http_code}\n" -X POST \
  "$API/api/v2/admin/agent-instances/$INSTANCE_ID/promote-to-template" \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$NEW_NAME\"}"

# 5. promote 后 DB 状态
echo "=== AFTER ==="
$DB -c "SELECT count(*) AS templates FROM agent_templates;"
$DB -c "SELECT count(*) AS instances FROM agent_instances;"
$DB -c "SELECT count(*) AS bots_bound FROM bot_configs WHERE agent_id = '$INSTANCE_ID';"
$DB -c "SELECT name FROM agent_templates WHERE name = '$NEW_NAME';"

# 6. 清理(可选)
echo "=== cleanup(删除测试模板) ==="
$DB -c "DELETE FROM agent_templates WHERE name = '$NEW_NAME' RETURNING id;"
