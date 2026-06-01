#!/usr/bin/env python3
"""
format-report.py — 套用 report-template 输出 Markdown 评审报告
输入: AI 评估结果 JSON (stdin) — 来自 schema.json 的 output 结构
输出: Markdown 报告 (stdout)
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List


def render_section(title: str, items: List[Dict[str, Any]]) -> str:
    if not items:
        return f"## {title}\n\n无\n"
    lines = [f"## {title}\n"]
    for it in items:
        sev = it.get("severity", "INFO")
        file = it.get("file", "?")
        line = it.get("line", 0)
        msg = it.get("message", "")
        rule = it.get("rule", "")
        rule_part = f" `[rule: {rule}]`" if rule else ""
        lines.append(f"- **[{sev}]** `{file}:{line}` — {msg}{rule_part}")
    return "\n".join(lines) + "\n\n"


def render_report(data: Dict[str, Any]) -> str:
    metadata = data.get("metadata", {})
    summary = data.get("severity_summary", {})
    pr_url = metadata.get("pr_url", "(unknown)")
    files_reviewed = metadata.get("files_reviewed", 0)
    lines_changed = metadata.get("lines_changed", 0)
    duration_ms = metadata.get("review_duration_ms", 0)
    confidence = metadata.get("confidence", 1.0)

    duration_s = duration_ms / 1000.0
    conf_marker = ""
    if confidence < 0.7:
        conf_marker = "  ⚠️ **置信度 < 0.7，建议人工复核**"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    md = f"""# Code Review Report

- **PR**: {pr_url}
- **生成时间**: {now}
- **文件数**: {files_reviewed} | **变更行数**: {lines_changed}
- **评审耗时**: {duration_s:.1f}s
- **置信度**: {confidence:.2f}{conf_marker}

## 严重度总览

| P0 | P1 | P2 | P3 |
|----|----|----|----|
| {summary.get('P0', 0)} | {summary.get('P1', 0)} | {summary.get('P2', 0)} | {summary.get('P3', 0)} |

{render_section("必改项 (Must Fix)", data.get("must_fix", []))}
{render_section("建议项 (Suggestions)", data.get("suggestions", []))}

---

> ⚠️ 业务逻辑正确性须由人工确认。本报告仅评估代码层面的安全性、可读性、性能等维度。
"""
    return md


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print("Error: empty input (expected AI evaluation JSON)", file=sys.stderr)
        return 64
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON: {e}", file=sys.stderr)
        return 65
    print(render_report(data))
    return 0


if __name__ == "__main__":
    sys.exit(main())
