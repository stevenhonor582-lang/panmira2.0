#!/usr/bin/env python3
"""
diff-parser.py — 解析 unified diff → 结构化变更
输入: diff 字符串 (stdin)
输出: JSON [{ file, old_file, hunks[], additions, deletions, language, is_binary, is_renamed }]
依赖: 仅 Python 3.11+ 标准库
"""
from __future__ import annotations
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional


LANG_BY_EXT: Dict[str, str] = {
    ".ts": "typescript", ".tsx": "typescript",
    ".js": "javascript", ".jsx": "javascript",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".java": "java", ".rb": "ruby", ".cs": "csharp",
    ".cpp": "cpp", ".c": "c", ".md": "markdown",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".sh": "shell", ".sql": "sql",
}


@dataclass
class HunkLine:
    type: str  # "add" | "del" | "ctx"
    content: str


@dataclass
class Hunk:
    old_start: int
    old_count: int
    new_start: int
    new_count: int
    header: str
    lines: List[HunkLine] = field(default_factory=list)


@dataclass
class FileChange:
    file: str
    old_file: Optional[str]
    hunks: List[Hunk]
    additions: int
    deletions: int
    language: str
    is_binary: bool
    is_renamed: bool


HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def detect_language(path: str) -> str:
    path_lower = path.lower()
    for ext, lang in LANG_BY_EXT.items():
        if path_lower.endswith(ext):
            return lang
    return "unknown"


def _is_hunk_boundary(line: str) -> bool:
    return line.startswith("@@")


def parse_diff(diff_text: str) -> List[FileChange]:
    lines = diff_text.splitlines()
    result: List[FileChange] = []
    i = 0
    n = len(lines)

    while i < n:
        line = lines[i]
        if not line.startswith("diff --git "):
            i += 1
            continue

        m = re.match(r"diff --git a/(.+) b/(.+)", line)
        if not m:
            i += 1
            continue
        old_file, new_file = m.group(1), m.group(2)
        i += 1

        is_binary = False
        is_renamed = new_file != old_file

        # 跳过 header（index / --- / +++ / mode / rename / binary）
        while i < n and (
            lines[i].startswith("index ")
            or lines[i].startswith("--- ")
            or lines[i].startswith("+++ ")
            or lines[i].startswith("new file")
            or lines[i].startswith("deleted file")
            or lines[i].startswith("old mode")
            or lines[i].startswith("new mode")
            or lines[i].startswith("similarity ")
            or lines[i].startswith("rename ")
            or lines[i].startswith("copy ")
            or lines[i].startswith("Binary files")
            or lines[i].startswith("dissimilarity ")
        ):
            if lines[i].startswith("Binary files") or "GIT binary patch" in lines[i]:
                is_binary = True
            i += 1

        hunks: List[Hunk] = []
        additions = 0
        deletions = 0

        while i < n and _is_hunk_boundary(lines[i]):
            hm = HUNK_RE.match(lines[i])
            if not hm:
                i += 1
                break
            old_start = int(hm.group(1))
            old_count = int(hm.group(2) or 1)
            new_start = int(hm.group(3))
            new_count = int(hm.group(4) or 1)
            header = hm.group(5).strip()
            i += 1

            hunk_lines: List[HunkLine] = []
            # 解析 hunk body：以下一个 @@ 或下一个 diff --git 为止
            while i < n and not _is_hunk_boundary(lines[i]) and not lines[i].startswith("diff --git "):
                cur = lines[i]
                if cur.startswith("+"):
                    hunk_lines.append(HunkLine("add", cur[1:]))
                    additions += 1
                elif cur.startswith("-"):
                    hunk_lines.append(HunkLine("del", cur[1:]))
                    deletions += 1
                elif cur.startswith(" "):
                    hunk_lines.append(HunkLine("ctx", cur[1:]))
                elif cur == "\\ No newline at end of file":
                    pass
                else:
                    # 遇到无法识别的行，停止 hunk
                    break
                i += 1

            hunks.append(Hunk(
                old_start=old_start,
                old_count=old_count,
                new_start=new_start,
                new_count=new_count,
                header=header,
                lines=hunk_lines,
            ))

        result.append(FileChange(
            file=new_file,
            old_file=old_file,
            hunks=hunks,
            additions=additions,
            deletions=deletions,
            language=detect_language(new_file),
            is_binary=is_binary,
            is_renamed=is_renamed,
        ))

    return result


def main() -> int:
    diff_text = sys.stdin.read()
    if not diff_text.strip():
        print("[]")
        return 0
    changes = parse_diff(diff_text)
    print(json.dumps([asdict(c) for c in changes], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
