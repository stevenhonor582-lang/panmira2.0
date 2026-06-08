#!/usr/bin/env python3
"""Quality checker: validates a proposal draft against the standard checklist.

Reads Markdown from stdin, performs deterministic checks, and prints a JSON
report to stdout. Stdlib only.

Checks:
  - Heading depth (max 3 levels, deeper is an issue)
  - Word-count deviation vs target (default 1500 chars, +/-30%)
  - Banned words (赋能/抓手/闭环/链路/差不多/先这样)
  - Mandatory sections (any of: 目标 / 方案 / 风险)
"""
import json
import re
import sys
from typing import Dict, List, Optional, Tuple

BANNED_WORDS = ["赋能", "抓手", "闭环", "链路", "差不多", "先这样"]
MANDATORY_KEYWORDS = ["目标", "方案", "风险"]
DEFAULT_TARGET_CHARS = 1500
TOLERANCE = 0.30
MAX_HEADING_DEPTH = 3


def count_chinese_chars(text: str) -> int:
    return sum(1 for c in text if "一" <= c <= "鿿")


def detect_headings(text: str) -> List[Tuple[int, str]]:
    headings: List[Tuple[int, str]] = []
    in_code = False
    for raw_line in text.splitlines():
        line = raw_line.rstrip()
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            depth = len(m.group(1))
            title = m.group(2).strip()
            headings.append((depth, title))
    return headings


def strip_markdown_noise(text: str) -> str:
    cleaned = re.sub(r"```[\s\S]*?```", " ", text)
    cleaned = re.sub(r"`[^`]*`", " ", cleaned)
    cleaned = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", cleaned)
    cleaned = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", cleaned)
    cleaned = re.sub(r"^#{1,6}\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*[-*+]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*\d+\.\s+", "", cleaned, flags=re.MULTILINE)
    return cleaned


def check_banned_words(text: str) -> List[Dict[str, str]]:
    found: List[Dict[str, str]] = []
    for word in BANNED_WORDS:
        if word in text:
            found.append({
                "type": "banned_word",
                "severity": "high",
                "message": f"检测到禁用语：{word}",
            })
    return found


def check_heading_depth(headings: List[Tuple[int, str]]) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []
    for depth, title in headings:
        if depth > MAX_HEADING_DEPTH:
            issues.append({
                "type": "heading_depth",
                "severity": "medium",
                "message": f"标题层级过深（{depth} > {MAX_HEADING_DEPTH}）：{title}",
            })
    return issues


def check_word_count(
    total_chars: int, target: int
) -> List[Dict[str, str]]:
    if total_chars == 0:
        return [{
            "type": "word_count",
            "severity": "high",
            "message": "文档为空，未检测到正文内容",
        }]
    if target <= 0:
        return []
    low = int(target * (1 - TOLERANCE))
    high = int(target * (1 + TOLERANCE))
    if total_chars < low:
        return [{
            "type": "word_count",
            "severity": "medium",
            "message": f"字数偏少：{total_chars} < 下限 {low}（目标 {target}，±30%）",
        }]
    if total_chars > high:
        return [{
            "type": "word_count",
            "severity": "low",
            "message": f"字数偏多：{total_chars} > 上限 {high}（目标 {target}，±30%）",
        }]
    return []


def check_mandatory_sections(
    headings: List[Tuple[int, str]], body: str
) -> List[Dict[str, str]]:
    corpus = "\n".join(title for _, title in headings) + "\n" + body
    for kw in MANDATORY_KEYWORDS:
        if kw in corpus:
            return []
    return [{
        "type": "missing_section",
        "severity": "high",
        "message": "缺少必含章节关键词（目标/方案/风险）任一",
    }]


def compute_score(
    issues: List[Dict[str, str]],
    total_chars: int,
    chinese_chars: int,
    headings_count: int,
) -> float:
    if not issues:
        return 1.0
    penalty = 0.0
    for issue in issues:
        sev = issue.get("severity", "low")
        if sev == "high":
            penalty += 0.30
        elif sev == "medium":
            penalty += 0.15
        else:
            penalty += 0.05
    score = 1.0 - penalty
    if total_chars == 0 or chinese_chars == 0 or headings_count == 0:
        score = min(score, 0.2)
    return max(0.0, min(1.0, round(score, 3)))


def parse_target_arg(argv: List[str]) -> int:
    for arg in argv[1:]:
        m = re.match(r"^--target=(\d+)$", arg)
        if m:
            try:
                return int(m.group(1))
            except ValueError:
                return DEFAULT_TARGET_CHARS
    return DEFAULT_TARGET_CHARS


def run_check(text: str, target_chars: int) -> dict:
    if not text or not text.strip():
        return {
            "passed": False,
            "score": 0.0,
            "issues": [{
                "type": "word_count",
                "severity": "high",
                "message": "输入为空（stdin 无内容）",
            }],
            "stats": {
                "total_chars": 0,
                "chinese_chars": 0,
                "headings_count": 0,
                "banned_words_found": 0,
            },
        }

    headings = detect_headings(text)
    body = strip_markdown_noise(text)
    total_chars = len(text)
    chinese_chars = count_chinese_chars(text)
    headings_count = len(headings)

    issues: List[Dict[str, str]] = []
    issues.extend(check_heading_depth(headings))
    issues.extend(check_word_count(total_chars, target_chars))
    issues.extend(check_mandatory_sections(headings, body))
    issues.extend(check_banned_words(text))

    banned_count = sum(1 for w in BANNED_WORDS if w in text)
    score = compute_score(issues, total_chars, chinese_chars, headings_count)

    high_count = sum(1 for i in issues if i.get("severity") == "high")
    passed = high_count == 0 and score >= 0.6

    return {
        "passed": passed,
        "score": score,
        "issues": issues,
        "stats": {
            "total_chars": total_chars,
            "chinese_chars": chinese_chars,
            "headings_count": headings_count,
            "banned_words_found": banned_count,
        },
    }


def main() -> int:
    raw = sys.stdin.read()
    target = parse_target_arg(sys.argv)
    report = run_check(raw, target)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
