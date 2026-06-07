#!/usr/bin/env python3
"""
unit/test_format_deploy_report.py — format-deploy-report 单元测试
运行: cd bots/shou-jing/skills/deploy-service && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = SKILL_ROOT / "scripts"
FORMATTER = SCRIPTS / "format-deploy-report.py"


def run_formatter(data: dict) -> tuple[int, str, str]:
    """调用 format-deploy-report.py 并返回 (exit_code, stdout, stderr)。"""
    proc = subprocess.run(
        [sys.executable, str(FORMATTER)],
        input=json.dumps(data),
        capture_output=True,
        text=True,
        timeout=10,
    )
    return proc.returncode, proc.stdout, proc.stderr


def base_deploy_result() -> dict:
    """生成基础部署结果（succeeded 状态）。"""
    started = datetime(2026, 6, 1, 22, 0, 0, tzinfo=timezone.utc)
    completed = started + timedelta(minutes=8)
    return {
        "deploy_id": "deploy-test-success",
        "status": "succeeded",
        "stages": {
            "preflight": {
                "status": "succeeded",
                "duration_ms": 1200,
                "checks": [{"id": "k8s.api", "status": "passed"}],
                "artifacts": {"check_count": 12}
            },
            "build": {
                "status": "succeeded",
                "duration_ms": 60000,
                "build_id": "build-abc123",
                "image_digest": "sha256:abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
                "artifacts": {"registry": "registry.internal"}
            },
            "deploy": {
                "status": "succeeded",
                "duration_ms": 300000,
                "strategy_used": "canary",
                "artifacts": {"rollout_revision": "rev-123"}
            },
            "verify": {
                "status": "succeeded",
                "duration_ms": 120000,
                "health_report": {"error_rate": 0.001, "p99_latency_ms": 180},
                "smoke_report": {"passed": 5, "failed": 0},
                "artifacts": {}
            },
            "post": {
                "status": "succeeded",
                "duration_ms": 5000,
                "artifacts": {"report_path": "runs/2026-06-01/deploy-test-success/"}
            }
        },
        "deployed_url": "https://panmira-core.prod.internal",
        "rollback_available_until": "2026-06-08T22:08:00Z",
        "metadata": {
            "service": "panmira-core",
            "version": "v1.5.2",
            "environment": "prod",
            "started_at": started.isoformat(),
            "completed_at": completed.isoformat(),
            "total_duration_ms": 486200,
            "deployer": "steven",
            "approver": "cio_feishu_id",
            "strategy_used": "canary"
        }
    }


class TestFormatDeployReport(unittest.TestCase):
    """format-deploy-report 行为测试（5 个核心 case）"""

    def test_01_succeeded_deployment(self):
        """成功部署报告：包含 5 阶段 + 状态标记 [OK]"""
        data = base_deploy_result()
        rc, out, err = run_formatter(data)
        self.assertEqual(rc, 0, f"expected 0, got {rc}, stderr: {err}")
        # 标题
        self.assertIn("Deploy Report", out)
        self.assertIn("deploy-test-success", out)
        # 5 阶段都有
        for stage in ["preflight", "build", "deploy", "verify", "post"]:
            self.assertIn(stage, out.lower())
        # 状态标记
        self.assertIn("[OK]", out)
        # 关键字段
        self.assertIn("panmira-core", out)
        self.assertIn("v1.5.2", out)
        self.assertIn("canary", out)
        # 报告元数据
        self.assertIn("Deployer", out)
        self.assertIn("Approver", out)
        self.assertIn("cio_feishu_id", out)

    def test_02_failed_deployment(self):
        """失败部署报告：build 阶段 failed + 状态 [FAIL]"""
        data = base_deploy_result()
        data["deploy_id"] = "deploy-test-fail"
        data["status"] = "failed"
        data["stages"]["preflight"]["status"] = "succeeded"
        data["stages"]["build"]["status"] = "failed"
        data["stages"]["build"]["artifacts"] = {"error": "npm build exited 1"}
        data["stages"]["deploy"]["status"] = "skipped"
        data["stages"]["verify"]["status"] = "skipped"
        data["stages"]["post"]["status"] = "skipped"

        rc, out, err = run_formatter(data)
        self.assertEqual(rc, 0)
        self.assertIn("[FAIL]", out)
        self.assertIn("failed", out)
        self.assertIn("deploy-test-fail", out)
        # build 阶段的错误信息应该出现
        self.assertIn("npm build exited 1", out)
        # skipped 阶段有标记
        self.assertIn("[SKIP]", out)

    def test_03_partial_success(self):
        """部分成功：deploy 阶段失败但 verify 通过（warning 级别）"""
        data = base_deploy_result()
        data["deploy_id"] = "deploy-test-partial"
        data["status"] = "failed"
        data["stages"]["preflight"]["status"] = "succeeded"
        data["stages"]["build"]["status"] = "succeeded"
        data["stages"]["deploy"]["status"] = "failed"
        data["stages"]["deploy"]["artifacts"] = {
            "replicas_updated": 1,
            "expected_replicas": 3,
            "error": "pod scheduling failed"
        }
        data["stages"]["verify"]["status"] = "skipped"
        data["stages"]["post"]["status"] = "skipped"

        rc, out, err = run_formatter(data)
        self.assertEqual(rc, 0)
        self.assertIn("[FAIL]", out)
        self.assertIn("pod scheduling failed", out)

    def test_04_rolled_back_deployment(self):
        """回滚部署：状态 rolled_back + 报告含 [ROLLBACK]"""
        data = base_deploy_result()
        data["deploy_id"] = "deploy-test-rollback"
        data["status"] = "rolled_back"
        data["stages"]["preflight"]["status"] = "succeeded"
        data["stages"]["build"]["status"] = "succeeded"
        data["stages"]["deploy"]["status"] = "succeeded"
        data["stages"]["verify"]["status"] = "failed"
        data["stages"]["verify"]["artifacts"] = {"rollback_triggered": True}
        data["stages"]["post"]["status"] = "succeeded"
        data["stages"]["post"]["artifacts"] = {"rollback_status": "succeeded"}

        rc, out, err = run_formatter(data)
        self.assertEqual(rc, 0)
        self.assertIn("[ROLLBACK]", out)
        self.assertIn("rolled_back", out)
        self.assertIn("deploy-test-rollback", out)
        # verify 阶段标记 [FAIL]
        self.assertIn("[FAIL]", out)
        # post 阶段标记 [OK]（回滚报告生成成功）

    def test_05_with_approval(self):
        """带审批的 prod 部署：approver 字段正确显示"""
        data = base_deploy_result()
        data["deploy_id"] = "deploy-test-prod-approval"
        data["metadata"]["environment"] = "prod"
        data["metadata"]["approver"] = "cio_feishu_id"
        data["metadata"]["change_window"] = {
            "start": "2026-06-01T22:00:00Z",
            "end": "2026-06-02T09:00:00Z"
        }

        rc, out, err = run_formatter(data)
        self.assertEqual(rc, 0)
        # 审批人显示
        self.assertIn("cio_feishu_id", out)
        self.assertIn("prod", out)
        # 5 阶段完整
        for stage in ["preflight", "build", "deploy", "verify", "post"]:
            self.assertIn(stage, out.lower())


class TestFormatDeployReportEdgeCases(unittest.TestCase):
    """边界情况测试"""

    def test_empty_input_returns_error(self):
        """空输入：exit code 64 + 错误信息"""
        proc = subprocess.run(
            [sys.executable, str(FORMATTER)],
            input="",
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("empty input", proc.stderr)

    def test_invalid_json_returns_error(self):
        """非法 JSON：exit code 65 + 错误信息"""
        proc = subprocess.run(
            [sys.executable, str(FORMATTER)],
            input="not a json {{{",
            capture_output=True,
            text=True,
            timeout=10,
        )
        self.assertNotEqual(proc.returncode, 0)
        self.assertIn("invalid JSON", proc.stderr)

    def test_minimal_result(self):
        """最小结果：仅有 deploy_id + status（其他字段缺失）"""
        minimal = {"deploy_id": "deploy-min", "status": "succeeded"}
        rc, out, err = run_formatter(minimal)
        self.assertEqual(rc, 0)
        self.assertIn("deploy-min", out)
        self.assertIn("[OK]", out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
