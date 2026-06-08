#!/usr/bin/env python3
"""test_quality_checker.py - quality-checker.py 单元测试

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
QUALITY_CHECKER = SCRIPTS / "quality-checker.py"


def run_quality(text: str, target: int = 1500) -> dict:
    proc = subprocess.run(
        [sys.executable, str(QUALITY_CHECKER), f"--target={target}"],
        input=text, capture_output=True, text=True, timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"quality-checker failed: {proc.stderr}")
    return json.loads(proc.stdout)


def make_clean_doc() -> str:
    """生成 1500 字左右干净文档：含目标/方案/风险关键词，无禁用语"""
    head = (
        "# 边缘计算能耗优化方案\n\n"
        "## 项目背景与目标\n\n"
        "本方案旨在 6 个月内将边缘节点 PUE 从 1.8 降至 1.4。\n\n"
        "## 实施方案\n\n"
        "分三个阶段推进：智能调度、液冷试点、全网推广。\n\n"
        "## 风险与对策\n\n"
        "主要风险是改造成本超支，业务迁移期间的服务波动。\n\n"
    )
    return head + ("中" * 1400)  # 凑到 ~1500 字


class TestQualityChecker(unittest.TestCase):
    """quality-checker 行为测试（7 个核心 case）"""

    def test_pass_clean_doc(self):
        """干净文档: passed=True, score>0.8"""
        text = make_clean_doc()
        result = run_quality(text)
        self.assertTrue(result["passed"], f"expected passed, got: {result}")
        self.assertGreater(result["score"], 0.8, f"score={result['score']}")
        self.assertEqual(result["issues"], [])

    def test_detect_banned_words(self):
        """禁用语: 含'赋能' -> issue"""
        text = make_clean_doc() + "\n\n通过技术赋能，提升整体效率。"
        result = run_quality(text)
        types = [i["type"] for i in result["issues"]]
        self.assertIn("banned_word", types)
        # 禁用语为 high severity
        banned_issues = [i for i in result["issues"] if i["type"] == "banned_word"]
        self.assertEqual(banned_issues[0]["severity"], "high")

    def test_detect_too_deep_headings(self):
        """标题层级过深: 4 级标题 -> issue"""
        text = (
            "# 标题\n\n## 目标\n\n## 方案\n\n"
            "#### 四级标题（过深）\n\n## 风险\n\n"
        ) + ("中" * 1500)
        result = run_quality(text)
        types = [i["type"] for i in result["issues"]]
        self.assertIn("heading_depth", types)
        depth_issues = [i for i in result["issues"] if i["type"] == "heading_depth"]
        self.assertEqual(depth_issues[0]["severity"], "medium")

    def test_detect_word_count_deviation(self):
        """字数偏差: 100 字（远低于 1500 目标）-> issue"""
        text = "# 标题\n\n## 目标\n\n## 方案\n\n## 风险\n\n内容很少。"
        result = run_quality(text)
        types = [i["type"] for i in result["issues"]]
        self.assertIn("word_count", types)
        wc_issues = [i for i in result["issues"] if i["type"] == "word_count"]
        # 字数偏少应为 medium severity
        self.assertEqual(wc_issues[0]["severity"], "medium")

    def test_detect_missing_section(self):
        """缺少必含章节: 无 目标/方案/风险 -> issue"""
        # 1100+ 字文档，但避开 目标/方案/风险 关键词
        text = "# 标题\n\n## 引言\n\n" + (
            "本文介绍项目背景与立项依据，详细阐述问题来源。" * 60
        )
        result = run_quality(text)
        types = [i["type"] for i in result["issues"]]
        self.assertIn("missing_section", types)
        miss_issues = [i for i in result["issues"] if i["type"] == "missing_section"]
        self.assertEqual(miss_issues[0]["severity"], "high")

    def test_score_calculation(self):
        """分数计算: score 在 [0, 1] 范围内"""
        text = make_clean_doc() + " 赋能"  # 故意引入一个问题
        result = run_quality(text)
        self.assertIsInstance(result["score"], float)
        self.assertGreaterEqual(result["score"], 0.0)
        self.assertLessEqual(result["score"], 1.0)

    def test_issues_severity_levels(self):
        """issue.severity 必须是 {high, medium, low} 之一"""
        # 制造禁用语问题，触发 high severity
        text = make_clean_doc() + " 通过技术赋能提升效率。"
        result = run_quality(text)
        self.assertGreater(len(result["issues"]), 0)
        valid_severities = {"high", "medium", "low"}
        for issue in result["issues"]:
            self.assertIn(
                issue["severity"], valid_severities,
                f"invalid severity: {issue['severity']} in {issue}",
            )


if __name__ == "__main__":
    unittest.main()
