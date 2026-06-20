#!/bin/bash
# scripts/rollback.sh — Rollback a specific migration via V*.down.sql
set -euo pipefail

if [ -z "${{1:-}}" ]; then
  echo "Usage: $0 <migration_name>" >&2
  exit 1
fi

NAME="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/db/migrations"
DOWN_FILE="$MIGRATIONS_DIR/${{NAME}}.down.sql"

if [ ! -f "$DOWN_FILE" ]; then
  echo "ERROR: $DOWN_FILE not found." >&2
  exit 1
fi

if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | xargs)
fi

applied=$(psql "$DATABASE_URL" -tA -c "SELECT applied_at FROM _migration_log WHERE migration_name = '$NAME';")
if [ -z "$applied" ]; then
  echo "WARN: $NAME not in _migration_log. Continuing anyway..."
fi

echo "=== Rollback: $NAME ==="
BACKUP_DIR="$PROJECT_ROOT/.backup"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/pre_rollback_${{NAME}}_$(date +%Y%m%d_%H%M%S).sql"
echo "Backup → $BACKUP_FILE"
pg_dump --schema-only "$DATABASE_URL" > "$BACKUP_FILE" || true

echo "→ Running down migration ..."
result=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\\i $DOWN_FILE
DELETE FROM _migration_log WHERE migration_name = '$NAME';
COMMIT;
SQL
) || { echo "FAILED. Backup at $BACKUP_FILE"; exit 1; }

echo "OK Rolled back: $NAME"
echo "Backup: $BACKUP_FILE"
