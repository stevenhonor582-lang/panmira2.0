#!/bin/bash
# Import .md/.txt files from a directory into MetaMemory
# Usage: ./import-docs.sh <directory> [folder_name]
# Example: ./import-docs.sh /home/ubuntu/panmira/docs "PanMira 文档"

set -euo pipefail

DIR="${1:?Usage: import-docs.sh <directory> [folder_name]}"
FOLDER_NAME="${2:-$(basename "$DIR")}"
MEMORY_URL="http://localhost:8100"
TOKEN="memory_admin_token"

echo "=== Importing docs from $DIR into folder '$FOLDER_NAME' ==="

# Create folder
FOLDER_RESP=$(curl -sf -X POST "$MEMORY_URL/api/folders" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$FOLDER_NAME\",\"parent_id\":\"root\"}" 2>/dev/null || echo "")

if [ -z "$FOLDER_RESP" ]; then
  echo "Folder may already exist, trying to find it..."
  FOLDER_ID=$(curl -sf "$MEMORY_URL/api/folders" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
def find(children, name):
    for c in children:
        if c.get('name') == name: return c['id']
        r = find(c.get('children', []), name)
        if r: return r
    return None
print(find(data.get('children', []), '$FOLDER_NAME') or '')
" 2>/dev/null)
  if [ -z "$FOLDER_ID" ]; then
    echo "ERROR: Could not create or find folder"
    exit 1
  fi
else
  FOLDER_ID=$(echo "$FOLDER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")
fi

echo "Folder ID: $FOLDER_ID"

# Import files
COUNT=0
find "$DIR" -type f \( -name "*.md" -o -name "*.txt" \) -not -path "*/node_modules/*" | while read -r FILE; do
  REL_PATH="${FILE#$DIR/}"
  TITLE=$(basename "$FILE" .md | sed 's/[-_]/ /g; s/\b\(.\)/\u\1/g')
  CONTENT=$(cat "$FILE")
  
  # Truncate very long content to 50KB
  if [ ${#CONTENT} -gt 51200 ]; then
    CONTENT="${CONTENT:0:51200}... [truncated]"
  fi

  RESP=$(curl -sf -X POST "$MEMORY_URL/api/documents" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$(python3 -c "
import json, sys
print(json.dumps({
    'title': sys.argv[1],
    'content': open(sys.argv[2]).read()[:51200],
    'folder_id': sys.argv[3],
    'path': sys.argv[4],
    'tags': ['imported'],
    'created_by': 'import-script'
}))
" "$TITLE" "$FILE" "$FOLDER_ID" "$REL_PATH")" 2>/dev/null)

  if [ -n "$RESP" ]; then
    echo "  OK: $REL_PATH"
    COUNT=$((COUNT + 1))
  else
    echo "  FAIL: $REL_PATH"
  fi
done

echo "=== Done. Imported documents. ==="
