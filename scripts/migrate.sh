#!/bin/bash
# scripts/migrate.sh — Apply pending V*.up.sql migrations
# Usage: ./scripts/migrate.sh [target_version]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/db/migrations"

if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -E '^DATABASE_URL=' "$PROJECT_ROOT/.env" | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set (check .env)" >&2
  exit 1
fi

echo "=== Migration runner ==="
echo "Migrations dir: $MIGRATIONS_DIR"
echo ""

psql "$DATABASE_URL" -c "CREATE TABLE IF NOT EXISTS _migration_log (migration_name text PRIMARY KEY, applied_at timestamptz DEFAULT now(), details jsonb);" > /dev/null

applied=$(psql "$DATABASE_URL" -tA -c "SELECT migration_name FROM _migration_log ORDER BY migration_name;")
applied_count=$(echo "$applied" | grep -c '.' || echo 0)
echo "Already applied: $applied_count"
echo ""

pending=()
for f in $(ls "$MIGRATIONS_DIR"/V*.up.sql 2>/dev/null | sort); do
  name=$(basename "$f" .up.sql)
  if echo "$applied" | grep -qF "$name"; then
    continue
  fi
  if [ -n "${1:-}" ] && [[ "$name" > "$1" ]]; then
    break
  fi
  pending+=("$f")
done

if [ ${#pending[@]} -eq 0 ]; then
  echo "OK No pending migrations."
  exit 0
fi

echo "Pending migrations: ${#pending[@]}"
for f in "${pending[@]}"; do
  echo "  - $(basename "$f")"
done
echo ""

for f in "${pending[@]}"; do
  name=$(basename "$f" .up.sql)
  echo "→ Applying $name ..."
  result=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
\\i $f
INSERT INTO _migration_log (migration_name, details)
VALUES ('$name', jsonb_build_object('script', '$0', 'file', '$(basename "$f")'));
COMMIT;
SQL
  ) || { echo "FAILED: $name"; echo "$result"; exit 1; }
  echo "OK Applied: $name"
done

echo ""
echo "=== Done. Total applied: $(($applied_count + ${#pending[@]})) ==="
