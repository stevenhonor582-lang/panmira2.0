#!/usr/bin/env python3
"""
chunk-text.py — 文档切片（按段落/标题/长度）
输入: 文档字符串 (stdin) 或 --file <path>
输出: JSON {"chunks": [...]}

切片规则（references/chunking-rules.md）：
- max_chunk_size = 500 字符
- overlap = 50 字符
- min_chunk_size = 50 字符
- 优先级：标题 > 段落 > 句子 > 强制
- 代码块、表格、列表项不切分
- 标题自动附加到下一段（不独立成 chunk）
- 段落 < min_size 时合并到上一块
"""
from __future__ import annotations
import argparse
import json
import re
import sys
from typing import List, Dict, Optional


DEFAULT_MAX_SIZE = 500
DEFAULT_OVERLAP = 50
DEFAULT_MIN_SIZE = 50


_HEADER_RE = re.compile(r"^(#{1,6}\s+.*)$", re.MULTILINE)


def split_by_headers(text: str) -> List[tuple]:
    """按 Markdown 标题切分，返回 [(header, body), ...]"""
    parts = _HEADER_RE.split(text)
    sections = []
    for i in range(1, len(parts), 2):
        header = parts[i]
        body = parts[i + 1] if i + 1 < len(parts) else ""
        sections.append((header.strip(), body))
    if parts and parts[0].strip():
        sections.insert(0, (None, parts[0]))
    if not sections:
        sections = [(None, text)]
    return sections


def split_by_paragraphs(text: str) -> List[str]:
    """按双换行切分"""
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def protect_blocks(text: str) -> tuple:
    """保护代码块 / 表格 / 列表项不被切分（占位符替换）"""
    placeholders: Dict[str, str] = {}

    def repl(match: re.Match, prefix: str) -> str:
        idx = len(placeholders)
        key = f"__BLOCK_{prefix}_{idx}__"
        placeholders[key] = match.group(0)
        return key

    text = re.sub(r"```[\s\S]*?```", lambda m: repl(m, "CODE"), text)
    text = re.sub(r"(?:^\|.*\|\s*$\n?)+", lambda m: repl(m, "TABLE"), text, flags=re.MULTILINE)
    text = re.sub(r"^(\s*[-*]|\s*\d+\.)\s+.*$", lambda m: repl(m, "LIST"), text, flags=re.MULTILINE)
    return text, placeholders


def restore_blocks(text: str, placeholders: Dict[str, str]) -> str:
    """还原占位符"""
    for key, val in placeholders.items():
        text = text.replace(key, val)
    return text


def force_split(text: str, max_size: int, overlap: int) -> List[str]:
    """强制按 max_size 切分（带 overlap）"""
    if len(text) <= max_size:
        return [text]
    chunks = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + max_size, n)
        chunks.append(text[start:end])
        if end >= n:
            break
        start = max(end - overlap, start + 1)
    return chunks


def _append_or_merge(chunks: List[str], text: str, min_size: int) -> None:
    """追加到 chunks 列表；若 text 过短则合并到上一块。"""
    if not text:
        return
    if chunks and len(text) < min_size:
        chunks[-1] = (chunks[-1] + "\n\n" + text).strip()
    else:
        chunks.append(text)


def _process_paragraph(para: str, max_size: int, overlap: int) -> List[str]:
    """处理单段：超长则 force_split，否则原样返回"""
    if len(para) <= max_size:
        return [para]
    return force_split(para, max_size, overlap)


def chunk_text(text: str, max_size: int = DEFAULT_MAX_SIZE,
               overlap: int = DEFAULT_OVERLAP, min_size: int = DEFAULT_MIN_SIZE) -> List[Dict]:
    """主切片函数。

    规则：
    1. 按 Markdown 标题切分 sections
    2. 标题自动 prepend 到下一段（确保上下文）
    3. 每个 section 内按段落切分
    4. 单段落超 max_size → 强制切分（带 overlap）
    5. 单段落 < min_size → 合并到上一块
    """
    if not text or not text.strip():
        return []

    protected, placeholders = protect_blocks(text)
    sections = split_by_headers(protected)
    chunks: List[str] = []

    for header, body in sections:
        if not body or not body.strip():
            if header:
                _append_or_merge(chunks, header, min_size)
            continue

        paragraphs = split_by_paragraphs(body)
        if not paragraphs:
            if header:
                _append_or_merge(chunks, header, min_size)
            continue

        # 把 header prepend 到第一段
        first_para = paragraphs[0]
        if header:
            first_para = f"{header}\n\n{first_para}"

        for i, para in enumerate([first_para] + paragraphs[1:]):
            for piece in _process_paragraph(para, max_size, overlap):
                _append_or_merge(chunks, piece, min_size)

    merged = [restore_blocks(c, placeholders) for c in chunks]

    return [
        {
            "chunk_id": f"chunk-{i:04d}",
            "chunk_index": i,
            "text": c,
            "char_count": len(c),
        }
        for i, c in enumerate(merged)
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description="Chunk text into retrieval units")
    parser.add_argument("--file", help="input file path (default: stdin)")
    parser.add_argument("--max-size", type=int, default=DEFAULT_MAX_SIZE)
    parser.add_argument("--overlap", type=int, default=DEFAULT_OVERLAP)
    parser.add_argument("--min-size", type=int, default=DEFAULT_MIN_SIZE)
    parser.add_argument("--source-id", default="unknown")
    args = parser.parse_args()

    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    else:
        text = sys.stdin.read()

    chunks = chunk_text(text, args.max_size, args.overlap, args.min_size)
    for c in chunks:
        c["source_id"] = args.source_id

    json.dump({"chunks": chunks, "count": len(chunks)}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
