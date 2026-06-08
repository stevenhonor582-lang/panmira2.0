#!/usr/bin/env python3
"""
format-incident-report.py — 格式化事故报告
输入: 事故 JSON (stdin) { incident_id, severity, classification, recommended_actions, timeline?, impact? }
输出: Markdown 报告 (stdout)
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import sys
from typing import Any, Dict, List


def render_report(incident: Dict[str, Any]) -> str:
    incident_id = incident.get("incident_id", "INC-UNKNOWN")
    severity = incident.get("severity", "P3")
    cls = incident.get("classification", {})
    category = cls.get("category", "unknown")
    affected_scope = cls.get("affected_scope", "未知")
    root_cause = cls.get("suspected_root_cause", "未知")
    actions = incident.get("recommended_actions", [])
    metadata = incident.get("metadata", {})
    timeline = incident.get("timeline", [])
    impact = incident.get("impact", {})
    matched = incident.get("matched_runbook", "")

    lines: List[str] = []
    lines.append(f"# 事故报告: {incident_id}")
    lines.append("")
    lines.append(f"- **严重等级**: {severity}")
    lines.append(f"- **故障类型**: {category}")
    lines.append(f"- **分级时间**: {metadata.get('classified_at', 'N/A')}")
    lines.append(f"- **置信度**: {metadata.get('confidence', 0)}")
    if matched:
        lines.append(f"- **匹配 Runbook**: `{matched}`")
    lines.append("")
    lines.append("## 1. 影响范围")
    lines.append("")
    lines.append(f"- {affected_scope}")
    if impact:
        for k, v in impact.items():
            lines.append(f"- {k}: {v}")
    lines.append("")
    lines.append("## 2. 推测根因")
    lines.append("")
    lines.append(f"> {root_cause}")
    lines.append("")
    lines.append("## 3. 建议动作")
    lines.append("")
    if actions:
        lines.append("| 动作 | 紧急度 | 负责人 |")
        lines.append("|------|--------|--------|")
        for a in actions:
            lines.append(f"| {a.get('action', '')} | {a.get('urgency', '')} | {a.get('owner', '')} |")
    else:
        lines.append("- （无）")
    lines.append("")
    if timeline:
        lines.append("## 4. 时间线")
        lines.append("")
        lines.append("| 时间 | 事件 | 操作人 |")
        lines.append("|------|------|--------|")
        for t in timeline:
            lines.append(f"| {t.get('ts', '')} | {t.get('event', '')} | {t.get('actor', '')} |")
        lines.append("")
    lines.append("## 5. 后续")
    lines.append("")
    if severity in ("P0", "P1"):
        lines.append("- 48h 内发布 post-mortem（参考 `references/post-mortem-template.md`）")
        lines.append("- 通知升级链全部节点")
    else:
        lines.append("- 排期修复，加入任务池")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    try:
        incident = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON input: {e}", file=sys.stderr)
        return 64

    if "incident_id" not in incident:
        print("Error: 'incident_id' required", file=sys.stderr)
        return 65

    print(render_report(incident))
    return 0


if __name__ == "__main__":
    sys.exit(main())
