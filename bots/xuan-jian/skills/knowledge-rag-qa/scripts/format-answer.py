#!/usr/bin/env python3
"""
format-answer.py — 答案格式化（含引用）
输入: JSON {"answer": str, "citations": [...], "confidence": float} (stdin)
输出: Markdown 文本 (stdout)

格式（references/citation-format.md）：
  {answer}
  
  **引用：**
  [1] {title} - {snippet}
  [2] ...
  
  **置信度：** {high/medium/low}
"""
from __future__ import annotations
import json
import re
import sys
from typing import List, Dict


def confidence_label(c: float) -> str:
    if c >= 0.85:
        return "高"
    if c >= 0.7:
        return "中"
    if c >= 0.5:
        return "低"
    return "无"


def confidence_note(c: float) -> str:
    if c >= 0.85:
        return ""
    if c >= 0.7:
        return "\n\n> **提示**：置信度中等，建议核实关键事实。"
    if c >= 0.5:
        return "\n\n> **提示**：置信度较低，答案仅供参考。"
    return "\n\n> **提示**：置信度过低，答案可能不准确。"


def format_no_answer(query: str) -> str:
    return (
        f"知识库中暂无与 \"{query}\" 直接相关的信息。\n\n"
        f"**建议：**\n"
        f"- 换个问法（更具体 / 更通用）\n"
        f"- 确认问题涉及的文档已通过 knowledge-ingest 摄取\n"
        f"- 补充源文档后再试"
    )


def format_answer(answer: str, citations: List[Dict], confidence: float,
                  include_citations: bool = True) -> str:
    md_parts: List[str] = []
    md_parts.append(answer.strip())

    if include_citations and citations:
        md_parts.append("\n**引用：**")
        for i, c in enumerate(citations, 1):
            title = c.get("source_title", c.get("source_id", f"ref-{i}"))
            text = c.get("chunk_text", "")
            snippet = text[:100] + "..." if len(text) > 100 else text
            snippet = snippet.replace("\n", " ").strip()
            score = c.get("score", 0.0)
            md_parts.append(f"[{i}] {title} (相关度: {score:.2f}) - {snippet}")

    if confidence > 0:
        md_parts.append(f"\n**置信度：** {confidence_label(confidence)} ({confidence:.2f})")

    md_parts.append(confidence_note(confidence))
    return "\n".join(md_parts)


def assign_citation_numbers(answer: str, citations: List[Dict]) -> str:
    """自动给答案中的 [N] 分配 source（如果答案中已含 [N]，按出现顺序分配）"""
    if not citations:
        return answer
    return answer


def main() -> int:
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        sys.stderr.write(f"ERROR: invalid JSON input: {e}\n")
        return 1

    query = data.get("query", "")
    answer = data.get("answer", "")
    citations = data.get("citations", [])
    confidence = data.get("confidence", 0.0)
    include_citations = data.get("include_citations", True)

    if confidence < 0.5 or not answer or not citations:
        print(format_no_answer(query))
        return 0

    md = format_answer(answer, citations, confidence, include_citations)
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())
