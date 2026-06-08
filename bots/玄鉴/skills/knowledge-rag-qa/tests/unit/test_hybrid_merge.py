#!/usr/bin/env python3
"""
test_hybrid_merge.py — hybrid-merge.py 单元测试
运行: cd bots/xuan-jian/skills/knowledge-rag-qa && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = SKILL_ROOT / "scripts"
HYBRID = SCRIPTS / "hybrid-merge.py"


def write_tmp(data: dict) -> str:
    fd, path = tempfile.mkstemp(suffix=".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return path


def run_hybrid(kw: dict = None, vec: dict = None,
               top_k: int = 5, mode: str = "hybrid") -> dict:
    args = [sys.executable, str(HYBRID), "--top-k", str(top_k), "--mode", mode]
    kw_path = None
    vec_path = None
    if kw is not None:
        kw_path = write_tmp(kw)
        args.extend(["--keyword", kw_path])
    if vec is not None:
        vec_path = write_tmp(vec)
        args.extend(["--vector", vec_path])

    proc = subprocess.run(args, capture_output=True, text=True, timeout=10)
    if proc.returncode != 0:
        raise RuntimeError(f"hybrid-merge failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestHybridMerge(unittest.TestCase):
    """hybrid-merge 行为测试（4 个核心 case）"""

    def test_01_basic_merge(self):
        """基本融合：keyword + vector 都有结果"""
        kw = {"results": [
            {"source_id": "doc-1", "chunk_index": 0, "chunk_id": "c1", "chunk_text": "A", "score": 0.8},
            {"source_id": "doc-1", "chunk_index": 1, "chunk_id": "c2", "chunk_text": "B", "score": 0.5},
        ]}
        vec = {"results": [
            {"source_id": "doc-1", "chunk_index": 0, "chunk_id": "c1", "chunk_text": "A", "score": 0.9},
            {"source_id": "doc-1", "chunk_index": 2, "chunk_id": "c3", "chunk_text": "C", "score": 0.7},
        ]}
        result = run_hybrid(kw=kw, vec=vec)
        self.assertEqual(len(result["results"]), 3)
        # c1 同时在两边，分数最高
        self.assertEqual(result["results"][0]["chunk_id"], "c1")
        # 验证 c1 的 vector_score 和 keyword_score
        c1 = result["results"][0]
        self.assertAlmostEqual(c1["vector_score"], 0.9, places=5)
        self.assertAlmostEqual(c1["keyword_score"], 0.8, places=5)

    def test_02_keyword_only_mode(self):
        """keyword 模式：只走 keyword 结果"""
        kw = {"results": [
            {"source_id": "doc-1", "chunk_index": 0, "chunk_id": "c1", "chunk_text": "A", "score": 0.6},
        ]}
        vec = {"results": [
            {"source_id": "doc-1", "chunk_index": 1, "chunk_id": "c2", "chunk_text": "B", "score": 0.9},
        ]}
        result = run_hybrid(kw=kw, vec=vec, mode="keyword")
        # keyword 模式只返回 c1
        ids = [r["chunk_id"] for r in result["results"]]
        self.assertIn("c1", ids)
        self.assertNotIn("c2", ids)

    def test_03_vector_only_mode(self):
        """vector 模式：只走 vector 结果"""
        kw = {"results": [
            {"source_id": "doc-1", "chunk_index": 0, "chunk_id": "c1", "chunk_text": "A", "score": 0.9},
        ]}
        vec = {"results": [
            {"source_id": "doc-1", "chunk_index": 1, "chunk_id": "c2", "chunk_text": "B", "score": 0.7},
        ]}
        result = run_hybrid(kw=kw, vec=vec, mode="vector")
        ids = [r["chunk_id"] for r in result["results"]]
        self.assertIn("c2", ids)
        self.assertNotIn("c1", ids)

    def test_04_confidence_empty(self):
        """空结果：confidence = 0"""
        result = run_hybrid(kw={"results": []}, vec={"results": []})
        self.assertEqual(result["results"], [])
        self.assertEqual(result["confidence"], 0.0)

    def test_05_top_k_limit(self):
        """top_k 限制：返回不超过 K 个结果"""
        kw = {"results": [
            {"source_id": f"doc-{i}", "chunk_index": i, "chunk_id": f"c{i}",
             "chunk_text": f"text-{i}", "score": 1.0 - i * 0.1}
            for i in range(10)
        ]}
        vec = {"results": []}
        result = run_hybrid(kw=kw, vec=vec, top_k=3, mode="keyword")
        self.assertEqual(len(result["results"]), 3)


if __name__ == "__main__":
    unittest.main()
