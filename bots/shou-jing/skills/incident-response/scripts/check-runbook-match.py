#!/usr/bin/env python3
"""
check-runbook-match.py — 匹配 runbook（基于关键词）
输入: 症状文本 (stdin)
输出: JSON { matched_runbook, score, reasoning }
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import List, Tuple


# 关键词 → runbook 映射（优先级从高到低）
KEYWORD_RULES: List[Tuple[List[str], str]] = [
    (["数据泄露", "入侵", "data breach", "攻击", "ddos", "越权", "security"], "security-incident.md"),
    (["db", "数据库", "postgres", "mysql", "redis", "mongo", "connection pool", "主库", "从库"], "database-failure.md"),
    (["timeout", "超时", "504", "dns", "ssl", "网络", "firewall"], "network-issue.md"),
    (["down", "挂了", "不可用", "health check", "connection refused"], "service-down.md"),
    (["5xx", "错误率", "error rate", "p99"], "high-error-rate.md"),
]


SCRIPT_DIR = Path(__file__).resolve().parent
RUNBOOK_DIR = SCRIPT_DIR.parent / "references" / "runbooks"


def find_runbook(symptoms: str) -> dict:
    text_lower = symptoms.lower()
    scores: dict = {}
    reasoning: List[str] = []

    for keywords, rb in KEYWORD_RULES:
        hits = [kw for kw in keywords if kw.lower() in text_lower]
        if hits:
            scores[rb] = scores.get(rb, 0) + len(hits)
            reasoning.append(f"runbook={rb} 命中关键词: {', '.join(hits)}")

    if not scores:
        return {
            "matched_runbook": None,
            "score": 0,
            "reasoning": "无匹配 runbook，需人工排查",
        }

    best = max(scores, key=scores.get)
    full_path = str(RUNBOOK_DIR / best)
    return {
        "matched_runbook": full_path,
        "matched_name": best,
        "score": scores[best],
        "reasoning": "; ".join(reasoning),
    }


def main() -> int:
    symptoms = sys.stdin.read().strip()
    if not symptoms:
        print("Error: symptoms text required (via stdin)", file=sys.stderr)
        return 64

    result = find_runbook(symptoms)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
