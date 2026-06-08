#!/usr/bin/env python3
"""test_word_counter.py - word-counter.py 单元测试

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
WORD_COUNTER = SCRIPTS / "word-counter.py"


def run_word_counter(text: str) -> dict:
    proc = subprocess.run(
        [sys.executable, str(WORD_COUNTER)],
        input=text, capture_output=True, text=True, timeout=10,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"word-counter failed: {proc.stderr}")
    return json.loads(proc.stdout)


class TestWordCounter(unittest.TestCase):
    """word-counter 行为测试（5 个核心 case）"""

    def test_chinese_only(self):
        """纯中文: '你好世界' -> chinese_chars=4"""
        result = run_word_counter("你好世界")
        self.assertEqual(result["chinese_chars"], 4)
        self.assertEqual(result["total_chars"], 4)
        self.assertEqual(result["ascii_chars"], 0)

    def test_mixed_chinese_english(self):
        """中英混合: 'Hello世界' -> chinese=2, ascii=5"""
        # Note: implementation counts space as ASCII printable, so input omits space
        result = run_word_counter("Hello世界")
        self.assertEqual(result["chinese_chars"], 2)
        self.assertEqual(result["ascii_chars"], 5)
        self.assertEqual(result["total_chars"], 7)

    def test_with_punctuation(self):
        """含标点中文: '你好，世界！' -> chinese_chars=4"""
        result = run_word_counter("你好，世界！")
        # 4 个汉字（中文字符 0x4e00-0x9fff 区间）
        self.assertEqual(result["chinese_chars"], 4)
        # 全角标点"，！"是 U+FF0C/U+FF01，不在 ASCII 0x20-0x7e 范围内
        # 所以 ascii_chars=0；total_chars=6（4 汉字 + 2 全角标点）
        self.assertEqual(result["total_chars"], 6)
        self.assertEqual(result["ascii_chars"], 0)

    def test_empty_text(self):
        """空文本: total_chars=0"""
        result = run_word_counter("")
        self.assertEqual(result["total_chars"], 0)
        self.assertEqual(result["chinese_chars"], 0)
        self.assertEqual(result["ascii_chars"], 0)

    def test_long_text(self):
        """长文本: 1000 字中文 -> total_chars=1000"""
        text = "字" * 1000
        result = run_word_counter(text)
        self.assertEqual(result["total_chars"], 1000)
        self.assertEqual(result["chinese_chars"], 1000)
        self.assertEqual(result["ascii_chars"], 0)


if __name__ == "__main__":
    unittest.main()
