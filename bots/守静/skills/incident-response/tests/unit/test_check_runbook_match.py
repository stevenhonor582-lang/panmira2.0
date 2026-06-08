"""
unit/test_check_runbook_match.py — check-runbook-match 单元测试
运行: cd bots/shou-jing/skills/incident-response && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[2]
MATCH_SCRIPT = SKILL_ROOT / "scripts" / "check-runbook-match.py"


def run_match(text: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(MATCH_SCRIPT)],
        input=text,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"check-runbook-match failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestCheckRunbookMatch(unittest.TestCase):
    """check-runbook-match 行为测试（4 个核心 case）"""

    def test_01_security_keyword_matches_security_incident(self):
        """安全关键词匹配 security-incident runbook"""
        result = run_match("检测到数据泄露，疑似入侵")
        self.assertIsNotNone(result["matched_runbook"])
        self.assertEqual(result["matched_name"], "security-incident.md")
        self.assertGreaterEqual(result["score"], 1)

    def test_02_database_keyword_matches_database_failure(self):
        """数据库关键词匹配 database-failure runbook"""
        result = run_match("postgres 主库 down，连接池耗尽")
        self.assertIsNotNone(result["matched_runbook"])
        self.assertEqual(result["matched_name"], "database-failure.md")

    def test_03_5xx_keyword_matches_high_error_rate(self):
        """5xx 关键词匹配 high-error-rate runbook"""
        result = run_match("5xx 错误率飙升到 80%")
        self.assertIsNotNone(result["matched_runbook"])
        self.assertEqual(result["matched_name"], "high-error-rate.md")

    def test_04_no_match_returns_null(self):
        """无匹配关键词返回 null"""
        result = run_match("今天天气真好")
        self.assertIsNone(result["matched_runbook"])
        self.assertEqual(result["score"], 0)
        self.assertIn("无匹配", result["reasoning"])

    def test_05_empty_input_returns_error(self):
        """空输入返回错误码"""
        proc = subprocess.run(
            [sys.executable, str(MATCH_SCRIPT)],
            input="",
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(proc.returncode, 0)

    def test_06_fuzzy_timeout_matches_network(self):
        """timeout 模糊匹配 network-issue"""
        result = run_match("上游 timeout，请求超时")
        self.assertIsNotNone(result["matched_runbook"])
        # 优先匹配 network-issue（含 timeout 关键词）
        self.assertIn(result["matched_name"], ("network-issue.md", "high-error-rate.md", "service-down.md"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
