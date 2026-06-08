#!/usr/bin/env python3
"""
Import /home/ubuntu/knowledge/shared/ files into 组织公共区 (DB folders)
- 飞书 API docs       → R4-技术库
- governance + coding → R0-品牌规范
- superpowers specs   → R5-产品库
- server-topology     → R4-技术库
"""
import os
import re
import uuid
import psycopg2
from datetime import datetime, timezone

DB = "postgresql://ubuntu:ubuntu@localhost:5432/metabot"

# 组织公共区 folder ID mapping (from DB)
ORG_FOLDERS = {
    "R0-品牌规范": "d23815aa-38dd-40e6-bb3b-c99cd0c38ea1",
    "R4-技术库":   "0c98c578-a1c2-4d80-b5fe-a05b59c59ab7",
    "R5-产品库":   "7eaf648b-9dd5-4f9b-b64f-9a07331cf742",
}

def slugify(title):
    return re.sub(r'[^a-zA-Z0-9_一-鿿-]', '', title.replace(' ', '-').replace('/', '-')).lower()[:80]

def categorize(rel_path):
    """Map file path to 组织公共区 folder key"""
    if 'feishu' in rel_path:
        return "R4-技术库"
    if 'governance' in rel_path:
        return "R0-品牌规范"
    if 'superpowers' in rel_path:
        return "R5-产品库"
    if 'coding-standards' in rel_path:
        return "R0-品牌规范"
    if 'server-topology' in rel_path:
        return "R4-技术库"
    if 'integration-plan' in rel_path or 'knowledge-base-design' in rel_path:
        return "R4-技术库"
    return "R4-技术库"

conn = psycopg2.connect(DB)
cur = conn.cursor()
imported = 0
skipped = 0

shared_dir = "/home/ubuntu/knowledge/shared"
for root, dirs, files in os.walk(shared_dir):
    # Skip __pycache__, .git
    dirs[:] = [d for d in dirs if d not in ('__pycache__', '.git', 'logs')]
    for fname in files:
        if fname.endswith('.pyc') or fname.startswith('.'):
            continue
        fpath = os.path.join(root, fname)
        rel = os.path.relpath(fpath, shared_dir)
        cat = categorize(rel)
        folder_id = ORG_FOLDERS.get(cat)
        if not folder_id:
            print(f"SKIP (no folder): {rel}")
            skipped += 1
            continue

        try:
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()
        except:
            print(f"SKIP (binary): {rel}")
            skipped += 1
            continue

        title = os.path.splitext(rel)[0].replace('/', ' › ')
        slug = slugify(rel)
        now = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
        doc_id = str(uuid.uuid4())
        doc_path = f"/组织公共区/{cat}/{slug}"

        cur.execute("""
            INSERT INTO documents (id, title, folder_id, path, content, tags, created_by, created_at, updated_at, quality_score, feedback_count)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (path) DO UPDATE SET content = EXCLUDED.content, updated_at = EXCLUDED.updated_at
        """, (
            doc_id, title, folder_id, doc_path, content,
            '["public-knowledge","' + cat + '"]', "system", now, now, 0, 0
        ))
        imported += 1
        print(f"OK  {rel} → {cat}")

conn.commit()
cur.close()
conn.close()
print(f"\nDone: {imported} imported, {skipped} skipped")
