#!/usr/bin/env python3
"""
coverage-check.py — 对比 base_sha vs head_sha 覆盖率
输入: $1=base_sha, $2=head_sha, $3=project_dir
输出: JSON { available, base_coverage, head_coverage, delta, files_changed_coverage[] }
优雅降级: coverage 工具缺失 → {"available": false}
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict


def detect_coverage_tool(project_dir: Path) -> str | None:
    """检测项目使用的 coverage 工具。返回工具名或 None。"""
    if (project_dir / "package.json").exists():
        pkg = json.loads((project_dir / "package.json").read_text())
        scripts = pkg.get("scripts", {})
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        if "jest" in deps or "vitest" in deps or "test" in scripts:
            return "jest"
        if "nyc" in scripts.get("coverage", "") or "c8" in deps:
            return "c8"
    if (project_dir / "pyproject.toml").exists() or (project_dir / "pytest.ini").exists():
        return "pytest-cov"
    if (project_dir / "go.mod").exists():
        return "go-coverage"
    return None


def has_command(name: str) -> bool:
    return shutil.which(name) is not None


def run_coverage(tool: str, project_dir: Path) -> float | None:
    """跑测试并解析 coverage percentage。返回 0-100 的数字，None = 跑失败。"""
    try:
        if tool == "jest" and has_command("npx"):
            cmd = ["npx", "--no-install", "jest", "--coverage", "--silent", "--json"]
            proc = subprocess.run(cmd, cwd=project_dir, capture_output=True, text=True, timeout=300)
            try:
                data = json.loads(proc.stdout)
                cov_map = data.get("coverageMap", {})
                if cov_map:
                    total = sum(v.get("pct", 0) for v in cov_map.values()) / max(len(cov_map), 1)
                    return round(total, 2)
            except json.JSONDecodeError:
                pass
        elif tool == "pytest-cov" and has_command("pytest"):
            cmd = ["pytest", "--cov=.", "--cov-report=json:/tmp/cov.json", "-q"]
            proc = subprocess.run(cmd, cwd=project_dir, capture_output=True, text=True, timeout=300)
            cov_file = Path("/tmp/cov.json")
            if cov_file.exists():
                data = json.loads(cov_file.read_text())
                totals = data.get("totals", {})
                return round(float(totals.get("percent_covered", 0)), 2)
        elif tool == "go-coverage" and has_command("go"):
            cmd = ["go", "test", "-cover", "-coverprofile=/tmp/cov.out", "./..."]
            proc = subprocess.run(cmd, cwd=project_dir, capture_output=True, text=True, timeout=300)
            cov_file = Path("/tmp/cov.out")
            if cov_file.exists():
                # 简单解析: coverage % 出现在最后一行
                lines = cov_file.read_text().strip().splitlines()
                if lines:
                    last = lines[-1]
                    if "coverage:" in last:
                        pct_str = last.split("coverage:")[1].split("%")[0].strip()
                        return round(float(pct_str), 2)
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return None
    return None


def main() -> int:
    args = sys.argv[1:]
    base_sha = args[0] if len(args) > 0 else None
    head_sha = args[1] if len(args) > 1 else None
    project_dir = Path(args[2]) if len(args) > 2 else Path.cwd()

    if not project_dir.is_dir():
        print(json.dumps({"available": False, "reason": f"project_dir not found: {project_dir}"}))
        return 0

    tool = detect_coverage_tool(project_dir)
    if tool is None:
        print(json.dumps({"available": False, "reason": "no coverage tool detected"}))
        return 0

    if not has_command("git"):
        print(json.dumps({"available": False, "reason": "git not available"}))
        return 0

    out: Dict[str, Any] = {
        "available": True,
        "tool": tool,
        "base_sha": base_sha,
        "head_sha": head_sha,
    }

    # 跑 base 覆盖率
    if base_sha:
        try:
            subprocess.run(["git", "checkout", "-q", base_sha], cwd=project_dir, check=True, capture_output=True, timeout=60)
            base_cov = run_coverage(tool, project_dir)
            out["base_coverage"] = base_cov
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            out["base_coverage"] = None

    # 跑 head 覆盖率
    if head_sha:
        try:
            subprocess.run(["git", "checkout", "-q", head_sha], cwd=project_dir, check=True, capture_output=True, timeout=60)
            head_cov = run_coverage(tool, project_dir)
            out["head_coverage"] = head_cov
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            out["head_coverage"] = None

    # delta
    if out.get("base_coverage") is not None and out.get("head_coverage") is not None:
        out["delta"] = round(out["head_coverage"] - out["base_coverage"], 2)
    else:
        out["delta"] = None

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
