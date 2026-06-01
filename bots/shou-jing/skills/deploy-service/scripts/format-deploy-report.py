#!/usr/bin/env python3
"""
format-deploy-report.py — 套用模板输出 Markdown 部署报告
输入: 完整部署 result JSON (stdin) — 符合 schema.json output 结构
输出: Markdown 报告 (stdout)
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import sys
from datetime import datetime, timezone, timedelta
from typing import Any, Dict


def status_emoji(status: str) -> str:
    """状态对应 emoji（输出为 ASCII 标记，遵循 [BLOCK] 等约定）。"""
    mapping = {
        "succeeded": "[OK]",
        "failed": "[FAIL]",
        "rolled_back": "[ROLLBACK]",
        "running": "[RUNNING]",
        "pending": "[PENDING]",
        "skipped": "[SKIP]",
    }
    return mapping.get(status, "[?]")


def render_stage(name: str, stage: Dict[str, Any]) -> str:
    status = stage.get("status", "unknown")
    duration = stage.get("duration_ms", 0)
    artifacts = stage.get("artifacts", {})

    lines = [f"### {name} {status_emoji(status)}"]
    lines.append(f"- 状态: `{status}`")
    lines.append(f"- 耗时: {duration} ms")

    # 阶段特定字段
    if name == "preflight":
        checks = stage.get("checks", [])
        if checks:
            lines.append(f"- 检查项: {len(checks)} 项")
    elif name == "build":
        if "build_id" in stage:
            lines.append(f"- Build ID: `{stage['build_id']}`")
        if "image_digest" in stage:
            lines.append(f"- Image Digest: `{stage['image_digest'][:16]}...`")
    elif name == "deploy":
        if "strategy_used" in stage:
            lines.append(f"- 策略: `{stage['strategy_used']}`")
    elif name == "verify":
        hr = stage.get("health_report", {})
        if hr:
            lines.append(f"- 错误率: {hr.get('error_rate', 0) * 100:.2f}%")
            lines.append(f"- P99 延迟: {hr.get('p99_latency_ms', 0)} ms")
        sr = stage.get("smoke_report", {})
        if sr:
            passed = sr.get("passed", 0)
            failed = sr.get("failed", 0)
            lines.append(f"- 冒烟测试: {passed} passed / {failed} failed")

    if artifacts:
        lines.append(f"- 制品:")
        for k, v in artifacts.items():
            lines.append(f"  - `{k}`: `{v}`")
    lines.append("")
    return "\n".join(lines)


def render_report(data: Dict[str, Any]) -> str:
    deploy_id = data.get("deploy_id", "unknown")
    status = data.get("status", "unknown")
    deployed_url = data.get("deployed_url", "-")
    rollback_until = data.get("rollback_available_until", "-")
    metadata = data.get("metadata", {})
    stages = data.get("stages", {})

    service = metadata.get("service", "unknown")
    version = metadata.get("version", "unknown")
    environment = metadata.get("environment", "unknown")
    deployer = metadata.get("deployer", "unknown")
    approver = metadata.get("approver", "-")
    strategy = metadata.get("strategy_used", "-")
    started = metadata.get("started_at", "-")
    completed = metadata.get("completed_at", "-")
    total_ms = metadata.get("total_duration_ms", 0)

    total_min = total_ms / 60000.0

    md = f"""# Deploy Report

- **Deploy ID**: `{deploy_id}`
- **服务**: `{service}`
- **版本**: `{version}`
- **环境**: `{environment}`
- **策略**: `{strategy}`
- **Deployer**: `{deployer}`
- **Approver**: `{approver}`
- **总状态**: {status_emoji(status)} `{status}`
- **总耗时**: {total_ms} ms ({total_min:.2f} min)
- **开始时间**: {started}
- **完成时间**: {completed}
- **部署 URL**: {deployed_url}
- **可回滚至**: {rollback_until}

---

## 5 阶段执行详情

"""
    stage_order = ["preflight", "build", "deploy", "verify", "post"]
    for sname in stage_order:
        if sname in stages:
            md += render_stage(sname, stages[sname])

    md += """---

> 注：本报告由 deploy-service skill (L3) 自动生成。审计日志在 `runs/<date>/<deploy_id>/exec.log`。
"""
    return md


def main() -> int:
    raw = sys.stdin.read()
    if not raw.strip():
        print("Error: empty input (expected deploy result JSON)", file=sys.stderr)
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
