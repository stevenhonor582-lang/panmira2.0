#!/bin/bash
# pg_dump cron — daily 3 AM, keep 14 days
set -eu
DB_NAME="panmira"
BACKUP_DIR="/home/ubuntu/backups"
TS=$(date +%F)
FILE="${BACKUP_DIR}/pg-${TS}.sql.gz"

sudo -n -u postgres pg_dump "$DB_NAME" | gzip > "$FILE"
chmod 600 "$FILE"

# Cleanup: keep last 14 days
find "$BACKUP_DIR" -name "pg-*.sql.gz" -mtime +14 -delete
