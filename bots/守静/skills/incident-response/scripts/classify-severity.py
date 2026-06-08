#!/usr/bin/env python3
"""
classify-severity.py — 故障分级（基于症状+规则）
输入: alert JSON (stdin) { summary, affected_service, error_rate?, source?, ... }
输出: JSON { incident_id, severity, classification, recommended_actions, metadata }
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Tuple


P0_KEYWORDS = ["5xx", "down", "挂了", "崩了", "不可用", "超时", "timeout",
               "connection refused", "data breach", "数据泄露", "入侵", "主库"]
P1_KEYWORDS = ["错误率", "5xx 飙升", "大量 5xx", "p99", "慢", "性能下降"]
P2_KEYWORDS = ["卡", "体验问题", "缓存命中率"]
P3_KEYWORDS = ["报错", "异常"]

# 安全关键词（命中即 P0，保守原则）
SECURITY_KEYWORDS = ["数据泄露", "入侵", "data breach", "ddos", "攻击", "越权", "security"]


def match_keywords(text: str, keywords: List[str]) -> bool:
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in keywords)


def classify_by_text(summary: str) -> Tuple[str, str]:
    """基于文本关键词分级。返回 (severity, reason)"""
    if match_keywords(summary, P0_KEYWORDS):
        return "P0", "命中 P0 关键词（5xx/down/超时/数据泄露等）"
    if match_keywords(summary, P1_KEYWORDS):
        return "P1", "命中 P1 关键词（错误率/p99/性能下降）"
    if match_keywords(summary, P2_KEYWORDS):
        return "P2", "命中 P2 关键词（卡/体验问题）"
    if match_keywords(summary, P3_KEYWORDS):
        return "P3", "命中 P3 关键词（报错/异常）"
    return "P2", "未命中明确关键词，默认 P2（保守原则）"


def classify_by_metrics(error_rate: float, p99_ms: int) -> Tuple[str, str]:
    """基于指标分级。返回 (severity, reason)"""
    if error_rate > 50 or p99_ms > 10000:
        return "P0", f"指标触发 P0：错误率 {error_rate}% > 50% 或 P99 {p99_ms}ms > 10s"
    if error_rate > 5 or p99_ms > 5000:
        return "P1", f"指标触发 P1：错误率 {error_rate}% > 5% 或 P99 {p99_ms}ms > 5s"
    if error_rate > 1 or p99_ms > 2000:
        return "P2", f"指标触发 P2：错误率 {error_rate}% > 1% 或 P99 {p99_ms}ms > 2s"
    return "P3", f"指标在基线内：error_rate={error_rate}%, p99={p99_ms}ms"


def suggest_category(text: str, error_rate: float) -> str:
    """推测故障类型"""
    text_lower = text.lower()
    if match_keywords(text, SECURITY_KEYWORDS):
        return "security-incident"
    if match_keywords(text, P0_KEYWORDS[:5]):
        if "db" in text_lower or "数据库" in text:
            return "database-failure"
        if "timeout" in text_lower or "超时" in text:
            return "network-issue"
        return "service-down"
    if error_rate > 5:
        return "high-error-rate"
    if "慢" in text or "性能" in text or "latency" in text_lower:
        return "performance-degradation"
    return "unknown"


def recommended_actions(severity: str, category: str, affected_service: str) -> List[Dict[str, str]]:
    """根据严重度+类型生成建议动作"""
    actions: List[Dict[str, str]] = []

    if severity == "P0":
        actions.append({"action": "立即创建飞书战时群 + @所有人", "urgency": "immediate", "owner": "shou-jing"})
        actions.append({"action": "拉监控快照 + 拉日志 + 匹配 runbook", "urgency": "immediate", "owner": "shou-jing"})
        actions.append({"action": f"通知 oncall 研发 (不盈) + 通讯 (信言)", "urgency": "immediate", "owner": "shou-jing"})
        actions.append({"action": f"执行 {category} runbook", "urgency": "5min", "owner": "bu-ying"})
        actions.append({"action": "升级到 oncall 主管", "urgency": "5min", "owner": "shou-jing"})
    elif severity == "P1":
        actions.append({"action": "飞书卡片通知 oncall", "urgency": "immediate", "owner": "shou-jing"})
        actions.append({"action": "拉监控 + 拉日志 + 匹配 runbook", "urgency": "5min", "owner": "shou-jing"})
        actions.append({"action": f"执行 {category} runbook", "urgency": "15min", "owner": "bu-ying"})
    elif severity == "P2":
        actions.append({"action": "飞书卡片异步通知 oncall", "urgency": "1h", "owner": "shou-jing"})
        actions.append({"action": "排期修复", "urgency": "1h", "owner": "bu-ying"})
    else:  # P3
        actions.append({"action": "加入 backlog", "urgency": "24h", "owner": "shou-jing"})

    return actions


def compute_confidence(severity_source: str) -> float:
    """基于分级来源返回置信度"""
    return {
        "metric": 0.95,
        "keyword": 0.85,
        "default": 0.6,
    }.get(severity_source, 0.7)


def main() -> int:
    try:
        alert = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as e:
        print(f"Error: invalid JSON input: {e}", file=sys.stderr)
        return 64

    summary = alert.get("summary", "")
    affected_service = alert.get("affected_service", "unknown")
    error_rate = float(alert.get("error_rate", 0))
    p99_ms = int(alert.get("p99_ms", 0))

    if not summary:
        print("Error: 'summary' is required", file=sys.stderr)
        return 65

    # 1. 安全关键词优先（保守原则：任何安全迹象都升级到 P0）
    if match_keywords(summary, SECURITY_KEYWORDS):
        severity = "P0"
        reason = f"命中安全关键词，直接 P0（{summary}）"
        source = "security"
    # 2. 指标优先（如有）
    elif error_rate > 0 or p99_ms > 0:
        severity, reason = classify_by_metrics(error_rate, p99_ms)
        source = "metric"
    # 3. 关键词降级路径
    else:
        severity, reason = classify_by_text(summary)
        source = "keyword"

    category = suggest_category(summary, error_rate)
    affected_scope = f"服务: {affected_service}"
    if error_rate > 0:
        affected_scope += f", 错误率: {error_rate}%"
    suspected_root_cause = reason

    incident_id = f"INC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    output = {
        "incident_id": incident_id,
        "severity": severity,
        "classification": {
            "category": category,
            "affected_scope": affected_scope,
            "suspected_root_cause": suspected_root_cause,
        },
        "recommended_actions": recommended_actions(severity, category, affected_service),
        "metadata": {
            "classified_at": now_iso,
            "classifier_version": "1.0.0",
            "confidence": compute_confidence(source),
        },
    }

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
