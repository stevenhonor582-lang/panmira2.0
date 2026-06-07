#!/bin/bash
# Health check monitor — run via cron every 5 minutes
# Sends Feishu alert if panmira is unhealthy for 3 consecutive checks

STALE_FILE="/tmp/panmira-health-failures"
MAX_FAILURES=3
API_SECRET=$(grep API_SECRET /home/ubuntu/panmira/.env | cut -d= -f2)
HEALTH_URL="http://localhost:9100/api/health"

RESPONSE=$(curl -s -H "Authorization: Bearer ${API_SECRET}" "$HEALTH_URL" 2>/dev/null)
STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','fail'))" 2>/dev/null)

if [ "$STATUS" = "ok" ]; then
  rm -f "$STALE_FILE"
  exit 0
fi

# Count failures
if [ -f "$STALE_FILE" ]; then
  COUNT=$(cat "$STALE_FILE")
  COUNT=$((COUNT + 1))
else
  COUNT=1
fi
echo "$COUNT" > "$STALE_FILE"

if [ "$COUNT" -ge "$MAX_FAILURES" ]; then
  /home/ubuntu/panmira/scripts/pm2-alert.sh "panmira" "health_check_fail" 1 "$COUNT"
  logger -t panmira-health "CRITICAL: Health check failed $COUNT times. Status: $STATUS"
  rm -f "$STALE_FILE"
fi
