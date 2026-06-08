#!/usr/bin/env python3
"""Section filler framework: emits a structured prompt + key points for LLM to fill a section.

Usage:
    section-filler.py <section_title> <section_index>

Outputs JSON to stdout describing how an LLM should write the section.
The actual content generation is performed by the calling LLM agent; this
script only produces a deterministic skeleton so that all sections are
addressed consistently.
"""
import json
import sys
from typing import List, Tuple

# Per-section key points. Indexed 1..N (1-based to match human expectations).
SECTION_TEMPLATES = {
    1: {
        "key_points": [
            "提案背景与立项依据",
            "核心问题陈述",
            "本文档的目标读者与价值",
        ],
        "style_hints": ["formal", "concise", "executive-summary"],
    },
    2: {
        "key_points": [
            "现状分析（含关键数据）",
            "存在的主要矛盾或痛点",
            "不解决的后果或风险",
        ],
        "style_hints": ["data-driven", "analytical"],
    },
    3: {
        "key_points": [
            "方案目标（SMART 原则）",
            "成功标准与可衡量指标",
            "边界与不在范围内事项",
        ],
        "style_hints": ["goal-oriented", "measurable"],
    },
    4: {
        "key_points": [
            "总体方案思路",
            "分阶段实施路径",
            "关键技术或资源依赖",
        ],
        "style_hints": ["structured", "practical"],
    },
    5: {
        "key_points": [
            "详细执行计划（含时间表）",
            "责任分工与协作机制",
            "里程碑与交付物清单",
        ],
        "style_hints": ["operational", "milestone-based"],
    },
    6: {
        "key_points": [
            "预期收益（含定性/定量）",
            "投入估算（人力、资金、时间）",
            "ROI 或成本回收周期",
        ],
        "style_hints": ["quantified", "business-case"],
    },
    7: {
        "key_points": [
            "已识别风险与影响等级",
            "缓解措施与应急预案",
            "后续监控与复盘机制",
        ],
        "style_hints": ["risk-aware", "pragmatic"],
    },
}

DEFAULT_LENGTHS = {1: 180, 2: 260, 3: 200, 4: 280, 5: 240, 6: 200, 7: 220}


def build_payload(title: str, index: int) -> dict:
    template = SECTION_TEMPLATES.get(index, {
        "key_points": [
            "围绕主题展开论述",
            "提供具体数据或案例",
            "与前后节保持逻辑衔接",
        ],
        "style_hints": ["formal", "data-driven"],
    })
    expected_length = DEFAULT_LENGTHS.get(index, 200)
    bullet_text = "\n".join(f"  - {p}" for p in template["key_points"])
    style_text = "、".join(template["style_hints"])

    prompt = (
        f"请撰写第 {index} 节：{title}\n\n"
        f"请覆盖以下要点：\n{bullet_text}\n\n"
        f"语气与风格要求：{style_text}。\n"
        f"目标字数约 {expected_length} 字（±20%）。\n"
        f"避免使用禁用语：赋能/抓手/闭环/链路/差不多/先这样。\n"
        f"如需引用数据，请用占位符 {{DATA:xxx}} 标注，由人工补充。"
    )

    return {
        "prompt_for_llm": prompt,
        "expected_length_words": expected_length,
        "key_points_to_cover": template["key_points"],
        "style_hints": template["style_hints"],
    }


def parse_args(argv: List[str]) -> Tuple[str, int]:
    if len(argv) < 3:
        print("Usage: section-filler.py <section_title> <section_index>", file=sys.stderr)
        sys.exit(2)
    title = argv[1].strip()
    if not title:
        print("Error: section_title must not be empty", file=sys.stderr)
        sys.exit(2)
    try:
        index = int(argv[2])
    except ValueError:
        print(f"Error: section_index must be integer, got {argv[2]!r}", file=sys.stderr)
        sys.exit(2)
    if index < 1 or index > 20:
        print(f"Error: section_index out of range (1-20), got {index}", file=sys.stderr)
        sys.exit(2)
    return title, index


def main() -> int:
    title, index = parse_args(sys.argv)
    payload = build_payload(title, index)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
