#!/bin/bash
# .claude/ tar backup — daily 4 AM, keep 14 days
set -eu
BACKUP_DIR="/home/ubuntu/backups"
TS=$(date +%F)
FILE="${BACKUP_DIR}/claude-${TS}.tar.gz"

tar czf "$FILE" -C /home/ubuntu .claude
chmod 600 "$FILE"

# Cleanup: keep last 14 days
find "$BACKUP_DIR" -name "claude-*.tar.gz" -mtime +14 -delete
