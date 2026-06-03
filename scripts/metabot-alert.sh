#!/bin/bash
# Panmira server health alert — every 5 min via /etc/cron.d/metabot-alert
set -u
LOG="/var/log/metabot-alerts.log"
ENV_FILE="/home/ubuntu/panmira/.env"
ALERTS=""

WEBHOOK=$(grep -E "^ALERT_WEBHOOK_URL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")
[[ -z "$WEBHOOK" ]] && WEBHOOK=$(grep -E "^FEISHU_ALERT_WEBHOOK=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'")

# Check 1: disk > 80%
DISK_PCT=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [[ "$DISK_PCT" -ge 80 ]]; then
  ALERTS="${ALERTS}⚠️ Disk ${DISK_PCT}%\n"
fi

# Check 2: memory available < 10%
MEM_AVAIL_PCT=$(free | grep "^Mem" | awk '{printf "%.0f", ($7/$2)*100}')
if [[ "$MEM_AVAIL_PCT" -lt 10 ]]; then
  ALERTS="${ALERTS}⚠️ Memory avail ${MEM_AVAIL_PCT}%\n"
fi

# Check 3: Panmira process running
# pm2-managed tsx process has full path "metabot/src/index.ts" in argv
# Also check pm2 daemon as fallback
if ! pgrep -f "metabot/src/index.ts" > /dev/null && ! pgrep -f "metabot/dist/index.js" > /dev/null; then
  sleep 5
  if ! pgrep -f "metabot/src/index.ts" > /dev/null && ! pgrep -f "metabot/dist/index.js" > /dev/null; then
    if ! pm2 ping > /dev/null 2>&1; then
      ALERTS="${ALERTS}🔴 Panmira + pm2 both down\n"
    else
      ALERTS="${ALERTS}⚠️ pm2 alive but Panmira process not found\n"
    fi
  fi
fi

# Check 4: load average > 2x cores
LOAD=$(uptime | awk -F'load average: ' '{print $2}' | cut -d, -f1 | tr -d ' ')
CORES=$(nproc)
if awk "BEGIN{exit !($LOAD > $CORES * 2)}" 2>/dev/null; then
  ALERTS="${ALERTS}⚠️ Load ${LOAD} > 2x cores (${CORES})\n"
fi

if [[ -n "$ALERTS" ]]; then
  MSG="[metabot-alert $(date -Iseconds)] $ALERTS"
  echo -e "$MSG" >> "$LOG"
  if [[ -n "$WEBHOOK" ]]; then
    curl -s -X POST "$WEBHOOK" -H 'Content-Type: application/json' \
      -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"$MSG\"}}" > /dev/null 2>&1
  fi
fi
