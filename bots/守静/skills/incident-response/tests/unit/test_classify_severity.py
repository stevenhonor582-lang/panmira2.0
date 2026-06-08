"""
unit/test_classify_severity.py — classify-severity 单元测试
运行: cd bots/shou-jing/skills/incident-response && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[2]
CLASSIFY = SKILL_ROOT / "scripts" / "classify-severity.py"


def run_classify(alert: dict) -> dict:
    proc = subprocess.run(
        [sys.executable, str(CLASSIFY)],
        input=json.dumps(alert),
        capture_output=True,
        text=True,
        timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"classify-severity failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestClassifySeverity(unittest.TestCase):
    """classify-severity 行为测试（7 个核心 case）"""

    def test_01_p0_metric_high_error_rate(self):
        """指标触发 P0：错误率 78%"""
        result = run_classify({
            "summary": "服务异常",
            "affected_service": "mahubot-core",
            "error_rate": 78,
        })
        self.assertEqual(result["severity"], "P0")
        self.assertGreaterEqual(result["metadata"]["confidence"], 0.9)
        self.assertEqual(result["classification"]["category"], "high-error-rate")
        self.assertGreaterEqual(len(result["recommended_actions"]), 3)

    def test_02_p1_metric_moderate_error_rate(self):
        """指标触发 P1：错误率 12%"""
        result = run_classify({
            "summary": "部分接口报错",
            "affected_service": "mahubot-portal",
            "error_rate": 12,
        })
        self.assertEqual(result["severity"], "P1")
        self.assertEqual(result["metadata"]["confidence"], 0.95)

    def test_03_p2_keyword_cache(self):
        """关键词触发 P2：缓存命中率"""
        result = run_classify({
            "summary": "缓存命中率下降",
            "affected_service": "mahubot-mcp",
        })
        self.assertEqual(result["severity"], "P2")
        self.assertEqual(result["classification"]["category"], "unknown")

    def test_04_p3_keyword_single_error(self):
        """关键词触发 P3：单词报错"""
        result = run_classify({
            "summary": "用户报告报错一次",
            "affected_service": "mahubot-core",
        })
        self.assertEqual(result["severity"], "P3")
        self.assertEqual(result["metadata"]["confidence"], 0.85)

    def test_05_security_upgrade_to_p0(self):
        """安全关键词升 P0：数据泄露"""
        result = run_classify({
            "summary": "检测到数据泄露异常",
            "affected_service": "mahubot-core",
            "error_rate": 2,
        })
        # 安全关键词必须强制 P0（即使指标不严重）
        self.assertEqual(result["severity"], "P0")
        self.assertEqual(result["classification"]["category"], "security-incident")

    def test_06_missing_summary_returns_error(self):
        """缺 summary 应返回错误码"""
        proc = subprocess.run(
            [sys.executable, str(CLASSIFY)],
            input=json.dumps({"affected_service": "x"}),
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("summary", proc.stderr)

    def test_07_output_schema_compliance(self):
        """输出包含 schema.json 要求的必填字段"""
        result = run_classify({
            "summary": "5xx 飙升",
            "affected_service": "mahubot-core",
            "error_rate": 80,
        })
        for key in ("incident_id", "severity", "classification", "recommended_actions", "metadata"):
            self.assertIn(key, result, f"missing required field: {key}")
        for key in ("classified_at", "classifier_version", "confidence"):
            self.assertIn(key, result["metadata"], f"missing metadata field: {key}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
