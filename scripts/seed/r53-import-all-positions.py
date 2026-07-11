#!/usr/bin/env python3
"""R53-A2 全量导入 agency-agents-zh 岗位 (T2)"""
import os
import re
import json
import sys
import psycopg2
from pathlib import Path

REPO = Path("/home/ubuntu/r52-import/agency-agents-zh")
DB_URL = "postgresql://ubuntu:ubuntu@localhost:5432/metabot"

DEPT_MAP = {
    "engineering": ("工程", "工程", "#2563eb"),
    "design": ("设计", "设计", "#ec4899"),
    "marketing": ("营销", "营销", "#f97316"),
    "paid-media": ("付费媒体", "营销", "#f97316"),
    "sales": ("销售", "销售", "#eab308"),
    "finance": ("财务", "财务", "#22c55e"),
    "hr": ("HR", "HR", "#a855f7"),
    "legal": ("法务", "法务", "#6366f1"),
    "supply-chain": ("供应链", "供应链", "#a16207"),
    "product": ("产品", "产品", "#06b6d4"),
    "project-management": ("项目管理", "工程", "#2563eb"),
    "testing": ("测试", "测试", "#64748b"),
    "customer-support": ("支持", "支持", "#0d9488"),
    "support": ("支持", "支持", "#0d9488"),
    "specialized": ("专项", "专项", "#6b7280"),
    "spatial-computing": ("空间计算", "空间计算", "#be185d"),
    "game-development": ("游戏开发", "游戏开发", "#991b1b"),
    "academic": ("学术", "学术", "#1e3a8a"),
    "gis": ("GIS", "GIS", "#0891b2"),
    "security": ("安全", "安全", "#dc2626"),
}

SKIP_TOP_DIRS = {"examples", "integrations", "scripts", "assets", "strategy", ".github", ".git"}


def parse_md(path):
    text = path.read_text(encoding="utf-8")
    name, description = "", ""
    body = text
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if m:
        fm = m.group(1)
        body = m.group(2)
        name_m = re.search(r"^name:\s*(.+?)\s*$", fm, re.MULTILINE)
        desc_m = re.search(r"^description:\s*(.+?)\s*$", fm, re.MULTILINE)
        if name_m:
            name = name_m.group(1).strip().strip("'\"")
        if desc_m:
            description = desc_m.group(1).strip().strip("'\"")
    if not name:
        h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        name = h1.group(1).strip() if h1 else path.stem
    if not description:
        bm = re.search(r"^#\s+.+?\n\n(.+?)(?:\n\n|\n#)", body, re.DOTALL | re.MULTILINE)
        description = bm.group(1).strip()[:300] if bm else ""
    return name, description, body


def is_yaml_position(path):
    try:
        head = path.read_text(encoding="utf-8", errors="ignore")[:4]
        return head.startswith("---")
    except Exception:
        return False


def collect_positions():
    positions = []
    for top_dir in REPO.iterdir():
        if not top_dir.is_dir() or top_dir.name in SKIP_TOP_DIRS:
            continue
        for md_file in top_dir.rglob("*.md"):
            if md_file.parent.name in SKIP_TOP_DIRS:
                continue
            if not md_file.is_file():
                continue
            if not is_yaml_position(md_file):
                continue
            rel = md_file.relative_to(REPO)
            parts = rel.parts
            if len(parts) < 2:
                continue
            dept_en = parts[0]
            if dept_en not in DEPT_MAP:
                continue
            positions.append((dept_en, md_file))
    return positions


def get_existing_role_templates(cur):
    cur.execute("SELECT role_template FROM agent_templates WHERE role_template IS NOT NULL")
    return {r[0] for r in cur.fetchall()}


def import_positions(cur, conn):
    """T2: 全量导入(纯导入,不删不改)"""
    print("=== T2: 全量导入 ===")
    positions = collect_positions()
    print(f"扫描到 {len(positions)} 个岗位文件")

    existing = get_existing_role_templates(cur)
    print(f"  已存在 role_template {len(existing)} 个")

    imported = 0
    skipped_exist = 0
    skipped_err = 0
    by_dept = {}
    for dept_en, md in positions:
        try:
            name, description, body = parse_md(md)
        except Exception as e:
            print(f"  解析失败: {md.relative_to(REPO)} ({e})")
            skipped_err += 1
            continue

        if not name:
            skipped_err += 1
            continue

        dept_zh, _, dept_color = DEPT_MAP.get(dept_en, (dept_en, dept_en, "#6b7280"))
        slug = md.stem  # 文件名 stem 已经包含 dept- 前缀,如 "engineering-mechanical-design-engineer"
        role_template = f"system-{slug}"[:255]

        if role_template in existing:
            skipped_exist += 1
            continue

        persona = description[:500] if description else f"专业的{dept_zh}岗位"
        system_prompt = body[:8000] if body else f"你是{dept_zh}领域的专业岗位"

        iron_laws = [
            f"严格遵守{dept_zh}领域的专业规范",
            "信息不准确时明确告知,不猜测",
            "始终以用户业务目标为导向",
        ]

        cur.execute("""
            INSERT INTO agent_templates (
                id, name, role_template, description,
                capabilities, tools, persona, system_prompt,
                iron_laws, category, template_type,
                source, is_active, visibility,
                created_at, updated_at
            )
            VALUES (
                gen_random_uuid(), %s, %s, %s,
                %s::jsonb, %s::jsonb, %s, %s,
                %s::jsonb, %s, %s,
                'system', true, 'public',
                now(), now()
            )
        """, (
            name[:200], role_template, description[:1000],
            json.dumps([], ensure_ascii=False),
            json.dumps([], ensure_ascii=False),
            persona, system_prompt,
            json.dumps(iron_laws, ensure_ascii=False),
            dept_zh, "业务",
        ))
        imported += 1
        by_dept[dept_zh] = by_dept.get(dept_zh, 0) + 1
        existing.add(role_template)

    conn.commit()
    print(f"  导入 {imported}, 已存在跳过 {skipped_exist}, 错误 {skipped_err}")
    print(f"\n  部门分布:")
    for dept in sorted(by_dept.keys()):
        print(f"    {dept}: {by_dept[dept]}")
    return imported, skipped_exist, skipped_err, by_dept


def main():
    print(f"DB: {DB_URL}")
    print(f"REPO: {REPO}")
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        imported, skipped_exist, skipped_err, by_dept = import_positions(cur, conn)
    except Exception as e:
        conn.rollback()
        print(f"\n!!! 错误: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()

    print(f"\n=== 汇总 ===")
    print(f"T2 导入: {imported} (已存在 {skipped_exist}, 错误 {skipped_err})")
    print(f"部门数: {len(by_dept)}")


if __name__ == "__main__":
    main()
