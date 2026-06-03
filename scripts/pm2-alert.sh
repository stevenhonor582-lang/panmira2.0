#!/bin/bash
# PM2 Crash Alert — sends notification to Feishu when metabot crashes
# Called by PM2 hook on process:exit

APP_NAME="$1"
EVENT="$2"
EXIT_CODE="$3"
RESTARTS="$4"

# Only alert on metabot crashes (not normal stop)
if [ "$APP_NAME" != "metabot" ]; then
  exit 0
fi

# Only alert on actual crashes (exit code != 0 and not stopped by user)
if [ "$EVENT" = "stopped" ] || [ "$EXIT_CODE" = "0" ]; then
  exit 0
fi

# Get last 10 lines of error log for context
ERROR_TAIL=$(tail -10 /home/ubuntu/panmira/logs/error.log 2>/dev/null | sed 's/"/\\"/g' | tr '\n' '\\n')

# Feishu webhook - use first bot's credentials
TIMESTAMP=$(date -Iseconds)
HOSTNAME=$(hostname)

# Build alert message
MESSAGE=$(cat << EOF
{
  "msg_type": "interactive",
  "card": {
    "header": {
      "title": {"tag": "plain_text", "content": "🔴 Panmira 崩溃告警"},
      "template": "red"
    },
    "elements": [
      {"tag": "div", "text": {"tag": "lark_md", "content": "**服务：** metabot\n**事件：** ${EVENT}\n**退出码：** ${EXIT_CODE}\n**重启次数：** ${RESTARTS}\n**时间：** ${TIMESTAMP}\n**主机：** ${HOSTNAME}"}},
      {"tag": "hr"},
      {"tag": "div", "text": {"tag": "lark_md", "content": "**最近错误日志：**\n\`\`\`\n${ERROR_TAIL}\n\`\`\`"}},
      {"tag": "note", "elements": [{"tag": "plain_text", "content": "PM2 Alert → MetaBot"}]}
    ]
  }
}
EOF
)

# Read credentials from .env
source <(grep -E "^(ANTHROPIC_AUTH_TOKEN|API_SECRET)=" /home/ubuntu/panmira/.env)

# Send to metabot's own API health endpoint for logging
curl -s -X POST "http://localhost:9100/api/internal/alert" \
  -H "Authorization: Bearer ${API_SECRET}" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"pm2_crash\",\"app\":\"$APP_NAME\",\"event\":\"$EVENT\",\"exitCode\":$EXIT_CODE,\"restarts\":$RESTARTS,\"timestamp\":\"$TIMESTAMP\"}" \
  > /dev/null 2>&1 &

echo "[PM2 Alert] Crash detected: $APP_NAME exit=$EXIT_CODE restarts=$RESTARTS at $TIMESTAMP"
