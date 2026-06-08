#!/usr/bin/env python3
"""
test_chunk_text.py — chunk-text.py 单元测试
运行: cd bots/xuan-jian/skills/knowledge-rag-qa && python3 -m pytest tests/unit/ -v
"""
from __future__ import annotations
import json
import subprocess
import sys
import unittest
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = SKILL_ROOT / "scripts"
CHUNK_TEXT = SCRIPTS / "chunk-text.py"


def run_chunk(text: str, max_size: int = 500, overlap: int = 50, min_size: int = 50) -> dict:
    proc = subprocess.run(
        [sys.executable, str(CHUNK_TEXT), "--max-size", str(max_size),
         "--overlap", str(overlap), "--min-size", str(min_size)],
        input=text, capture_output=True, text=True, timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"chunk-text failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestChunkText(unittest.TestCase):
    """chunk-text 行为测试（5 个核心 case）"""

    def test_01_basic_chunking(self):
        """基本切片：长段落（>= min_size）独立成 chunk"""
        para1 = "这是第一段内容。" * 8  # ~64 字符
        para2 = "这是第二段内容。" * 8
        text = f"{para1}\n\n{para2}"
        result = run_chunk(text)
        # 两段都 >= min_size（50），应被切成 2 块
        self.assertEqual(result["count"], 2)
        self.assertEqual(result["chunks"][0]["chunk_index"], 0)
        self.assertEqual(result["chunks"][1]["chunk_index"], 1)

    def test_02_max_size_limit(self):
        """长度限制：长文本被切成多个 ≤ max_size 的 chunk"""
        long_text = "句子。" * 200  # 600 字符
        result = run_chunk(long_text, max_size=200, overlap=20)
        for c in result["chunks"]:
            self.assertLessEqual(c["char_count"], 200)

    def test_03_overlap(self):
        """overlap：相邻 chunk 有内容重叠"""
        text = "abcdefghij" * 50  # 500 字符
        result = run_chunk(text, max_size=200, overlap=20)
        if len(result["chunks"]) >= 2:
            chunk1 = result["chunks"][0]["text"]
            chunk2 = result["chunks"][1]["text"]
            self.assertTrue(
                chunk2.startswith(chunk1[-20:]) or chunk1.endswith(chunk2[:20]),
                f"expected overlap, got {chunk1[-30:]!r} vs {chunk2[:30]!r}",
            )

    def test_04_chinese_text(self):
        """中文文本：长中文段落能切分，保留中文标点"""
        para = "中文段落测试，包含完整句子。" * 4  # ~120 字符
        text = f"{para}\n\n{para}"
        result = run_chunk(text)
        self.assertEqual(result["count"], 2)
        for c in result["chunks"]:
            # 中文标点完整保留
            self.assertTrue(
                any(p in c["text"] for p in "。！？"),
                f"chunk missing Chinese punctuation: {c['text']!r}",
            )

    def test_05_empty_text(self):
        """空文本：返回 0 个 chunk，不报错"""
        result = run_chunk("")
        self.assertEqual(result["count"], 0)
        self.assertEqual(result["chunks"], [])

    def test_06_short_paragraphs_merged(self):
        """短段落合并：< min_size 的相邻段落被合并"""
        short1 = "短段1"  # 3 字符
        short2 = "短段2"
        text = f"{short1}\n\n{short2}"
        result = run_chunk(text, min_size=50)
        # 短段被合并为 1 块
        self.assertEqual(result["count"], 1)


if __name__ == "__main__":
    unittest.main()
