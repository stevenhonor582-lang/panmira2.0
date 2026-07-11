#!/usr/bin/env python3
"""R53-T3 清老模板 (非 R52 seed,is_active=false 归档)"""
import psycopg2

DB_URL = "postgresql://ubuntu:ubuntu@localhost:5432/metabot"


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    print("=== T3: 清老模板 (非 R52 seed,system-% role_template) ===")
    cur.execute("""
        UPDATE agent_templates
        SET is_active = false, updated_at = now()
        WHERE source = 'system'
          AND role_template NOT LIKE 'system-%'
          AND is_active = true
        RETURNING name, role_template
    """)
    archived = cur.fetchall()
    conn.commit()
    print(f"本次归档 {len(archived)} 个老模板")
    for r in archived:
        print(f"  {r[0]} ({r[1]})")
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
