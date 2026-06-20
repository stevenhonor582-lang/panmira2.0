#!/bin/bash
# scripts/migrate-status.sh — Show migration status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/db/migrations"

if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | xargs)
fi

echo "=== Migration Status ==="
echo ""
echo "--- Applied ---"
psql "$DATABASE_URL" -c "SELECT migration_name, applied_at FROM _migration_log ORDER BY applied_at;" 2>&1

echo ""
echo "--- Migration files on disk ---"
ls "$MIGRATIONS_DIR"/V*.up.sql 2>/dev/null | xargs -n1 basename | sed "s/\\.up\\.sql$//"

echo ""
echo "--- Pending ---"
applied=$(psql "$DATABASE_URL" -tA -c "SELECT migration_name FROM _migration_log;" 2>&1)
for f in $(ls "$MIGRATIONS_DIR"/V*.up.sql 2>/dev/null | sort); do
  name=$(basename "$f" .up.sql)
  if ! echo "$applied" | grep -qF "$name"; then
    echo "  PENDING: $name"
  fi
done
