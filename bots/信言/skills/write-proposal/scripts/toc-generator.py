#!/usr/bin/env python3
"""从 Markdown 标题生成 TOC.

Usage:
    python3 toc-generator.py < draft.md
    cat draft.md | python3 toc-generator.py

Output: JSON to stdout:
    { toc_lines: ["- [标题](#anchor)", ...] }

仅处理 H1-H3 标题, 更深层级忽略.
"""
import json
import re
import sys


def slugify(text: str) -> str:
    """生成 GitHub 风格 anchor."""
    text = text.strip().lower()
    # 移除 markdown 标记
    text = re.sub(r"[`*_~]", "", text)
    # 中文字符保留 (不转拼音)
    # 非 ASCII 字符 (如中文) 跳过替换
    text = re.sub(r"[^\w一-鿿\s-]", "", text)
    # 空白转 -
    text = re.sub(r"\s+", "-", text)
    return text.strip("-")


def extract_titles(text: str, max_level: int = 3) -> list:
    """提取 H1-H3 标题, 返回 [(level, text, anchor), ...]."""
    titles = []
    seen = {}
    for line in text.splitlines():
        m = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if not m:
            continue
        level = len(m.group(1))
        if level > max_level:
            continue
        title_text = m.group(2).strip()
        anchor = slugify(title_text)
        # 处理重复 anchor
        if anchor in seen:
            seen[anchor] += 1
            anchor = f"{anchor}-{seen[anchor]}"
        else:
            seen[anchor] = 0
        titles.append((level, title_text, anchor))
    return titles


def format_toc(titles: list) -> list:
    """根据层级生成带缩进的 TOC 行."""
    toc = []
    for level, text, anchor in titles:
        indent = "  " * (level - 1)
        toc.append(f"{indent}- [{text}](#{anchor})")
    return toc


def main() -> int:
    text = sys.stdin.read()
    titles = extract_titles(text, max_level=3)
    result = {"toc_lines": format_toc(titles)}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
