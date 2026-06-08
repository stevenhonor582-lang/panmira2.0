#!/usr/bin/env python3
"""中文字数统计工具.

Usage:
    python3 word-counter.py < input.md
    cat input.md | python3 word-counter.py

Output: JSON to stdout with fields:
    total_chars, chinese_chars, ascii_chars, words, lines
"""
import json
import re
import sys


def count_text(text: str) -> dict:
    """统计文本字数, 区分中英文字符."""
    chinese_chars = len(re.findall(r"[一-鿿]", text))
    # ASCII 可打印字符 (去除空白)
    ascii_chars = len(re.findall(r"[\x20-\x7e]", text))
    total_chars = len(text)
    # 英文 "词" = 连续 ASCII 字母或数字
    words = len(re.findall(r"[A-Za-z0-9]+", text))
    lines = text.count("\n") + (1 if text and not text.endswith("\n") else 0)
    return {
        "total_chars": total_chars,
        "chinese_chars": chinese_chars,
        "ascii_chars": ascii_chars,
        "words": words,
        "lines": lines,
    }


def main() -> int:
    text = sys.stdin.read()
    result = count_text(text)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
