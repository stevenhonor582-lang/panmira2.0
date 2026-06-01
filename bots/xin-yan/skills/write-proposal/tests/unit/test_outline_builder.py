#!/usr/bin/env python3
"""test_outline_builder.py - outline-builder.py 单元测试

运行: cd bots/xin-yan/skills/write-proposal && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = SKILL_ROOT / "scripts"
OUTLINE_BUILDER = SCRIPTS / "outline-builder.py"


def run_outline(category: str, length: str, audience: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(OUTLINE_BUILDER), category, length, audience],
        capture_output=True, text=True, timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"outline-builder failed (rc={proc.returncode}): {proc.stderr or proc.stdout}"
        )
    return json.loads(proc.stdout)


class TestOutlineBuilder(unittest.TestCase):
    """outline-builder 行为测试（5 个核心 case）"""

    def test_product_template(self):
        """产品介绍 -> product-proposal 模板"""
        result = run_outline("产品介绍", "1500字", "管理层")
        self.assertEqual(result["template_used"], "product-proposal.md")
        self.assertIsInstance(result["outline"], list)
        self.assertGreater(len(result["outline"]), 0)
        self.assertGreater(result["section_count"], 0)

    def test_tech_template(self):
        """技术方案 -> tech-proposal 模板"""
        result = run_outline("技术方案", "3000字", "技术团队")
        self.assertEqual(result["template_used"], "tech-proposal.md")
        self.assertGreater(result["section_count"], 0)
        self.assertGreaterEqual(result["depth_level"], 1)

    def test_business_template(self):
        """商业计划 -> business-proposal 模板"""
        result = run_outline("商业计划", "3000字", "投资人")
        self.assertEqual(result["template_used"], "business-proposal.md")
        self.assertGreater(result["section_count"], 0)

    def test_marketing_template(self):
        """营销方案 -> marketing-proposal 模板"""
        result = run_outline("营销方案", "1500字", "客户")
        self.assertEqual(result["template_used"], "marketing-proposal.md")
        self.assertGreater(result["section_count"], 0)
        # 营销模板应有 6-8 节
        self.assertGreaterEqual(result["section_count"], 4)

    def test_audience_adjustment(self):
        """短篇+管理层: section_count < 5（精简版）"""
        result = run_outline("技术方案", "500字", "管理层")
        # 500字 -> sections=4（精简大纲）
        self.assertLess(result["section_count"], 5)
        self.assertGreaterEqual(result["section_count"], 3)
        # 短篇对应更浅的 depth_level
        self.assertEqual(result["depth_level"], 1)


if __name__ == "__main__":
    unittest.main()
