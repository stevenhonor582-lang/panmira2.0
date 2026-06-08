#!/usr/bin/env python3
"""根据 topic_category 选模板, 生成方案大纲.

Usage:
    python3 outline-builder.py <category> [length] [audience]
    python3 outline-builder.py "技术方案" "3000字" "技术团队"

Args:
    category: 产品介绍 | 技术方案 | 商业计划 | 营销方案 | 内部提案
    length:   500字 | 1500字 | 3000字 | 5000字+ (默认 1500字)
    audience: 管理层 | 技术团队 | 客户 | 投资人 | 合作伙伴 (默认 管理层)

Output: JSON to stdout:
    { outline: [...], template_used, depth_level, section_count }
"""
import json
import sys


TEMPLATES = {
    "产品介绍": {
        "file": "product-proposal.md",
        "outline": [
            "1. 产品概述",
            "2. 目标用户与场景",
            "3. 核心功能与价值",
            "4. 差异化优势",
            "5. 商业模式",
            "6. 路线图",
        ],
        "depth_level": 2,
    },
    "技术方案": {
        "file": "tech-proposal.md",
        "outline": [
            "1. 背景与挑战",
            "2. 方案目标",
            "3. 架构设计",
            "4. 关键技术选型",
            "5. 实施路径",
            "6. 风险评估",
            "7. 性能与可扩展性",
        ],
        "depth_level": 3,
    },
    "商业计划": {
        "file": "business-proposal.md",
        "outline": [
            "1. 执行摘要",
            "2. 市场分析",
            "3. 产品与服务",
            "4. 商业模式",
            "5. 团队介绍",
            "6. 财务预测",
            "7. 融资计划",
        ],
        "depth_level": 2,
    },
    "营销方案": {
        "file": "marketing-proposal.md",
        "outline": [
            "1. 营销目标",
            "2. 目标受众",
            "3. 核心策略",
            "4. 渠道与执行",
            "5. 预算分配",
            "6. 关键指标 (KPIs)",
            "7. 时间表",
            "8. 风险与应对",
        ],
        "depth_level": 2,
    },
    "内部提案": {
        "file": "proposal-template.md",
        "outline": [
            "1. 背景与目标",
            "2. 现状分析",
            "3. 方案概述",
            "4. 实施计划",
            "5. 资源需求",
            "6. 风险与缓解",
            "7. 预期成果",
        ],
        "depth_level": 2,
    },
}

LENGTH_GUIDE = {
    "500字":   {"sections": 4, "depth_level": 1},
    "1500字":  {"sections": 6, "depth_level": 2},
    "3000字":  {"sections": 7, "depth_level": 3},
    "5000字+": {"sections": 8, "depth_level": 3},
}

VALID_CATEGORIES = list(TEMPLATES.keys())
VALID_LENGTHS = list(LENGTH_GUIDE.keys())
VALID_AUDIENCES = ["管理层", "技术团队", "客户", "投资人", "合作伙伴"]


def adjust_depth(template_depth: int, length: str) -> int:
    """根据 length 调整深度, 但不超过模板本身支持的最大深度."""
    target = LENGTH_GUIDE.get(length, {}).get("depth_level", template_depth)
    return min(target, template_depth)


def trim_sections(outline: list, length: str) -> list:
    """按 length 截取前 N 节, 至少保留 3 节."""
    keep = LENGTH_GUIDE.get(length, {}).get("sections", len(outline))
    keep = max(3, min(keep, len(outline)))
    return outline[:keep]


def main() -> int:
    args = sys.argv[1:]
    if not args:
        print(
            json.dumps(
                {
                    "error": "missing topic_category",
                    "valid": VALID_CATEGORIES,
                },
                ensure_ascii=False,
            )
        )
        return 1

    category = args[0]
    length = args[1] if len(args) > 1 else "1500字"
    audience = args[2] if len(args) > 2 else "管理层"

    if category not in TEMPLATES:
        print(
            json.dumps(
                {"error": f"invalid category: {category}", "valid": VALID_CATEGORIES},
                ensure_ascii=False,
            )
        )
        return 1
    if length not in LENGTH_GUIDE:
        print(
            json.dumps(
                {"error": f"invalid length: {length}", "valid": VALID_LENGTHS},
                ensure_ascii=False,
            )
        )
        return 1
    if audience not in VALID_AUDIENCES:
        print(
            json.dumps(
                {"error": f"invalid audience: {audience}", "valid": VALID_AUDIENCES},
                ensure_ascii=False,
            )
        )
        return 1

    tpl = TEMPLATES[category]
    outline = trim_sections(list(tpl["outline"]), length)
    depth = adjust_depth(tpl["depth_level"], length)

    result = {
        "outline": outline,
        "template_used": tpl["file"],
        "depth_level": depth,
        "section_count": len(outline),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
