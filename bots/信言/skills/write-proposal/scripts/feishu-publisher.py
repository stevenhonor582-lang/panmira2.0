#!/usr/bin/env python3
"""Feishu publisher (mock): simulates publishing a document.

This script never calls the real Feishu API. It generates a mock URL and
returns deterministic JSON describing the (fake) publication. Stdlib only.

Usage:
    feishu-publisher.py <markdown_file_path> <title>

Outputs JSON to stdout:
    {
        "doc_url": "https://feishu.cn/docs/<id>",
        "doc_id": "<id>",
        "published_at": "<ISO8601 UTC>",
        "char_count": <int>,
        "title": "<title>",
        "mock": true
    }
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone


def read_file_safely(path: str) -> str:
    if not os.path.isfile(path):
        print(f"Error: file not found: {path}", file=sys.stderr)
        sys.exit(2)
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError as exc:
        print(f"Error: cannot read {path}: {exc}", file=sys.stderr)
        sys.exit(2)


def build_doc_id() -> str:
    # 12-char alphanumeric ID, lowercase for URL friendliness
    return uuid.uuid4().hex[:12]


def build_doc_url(doc_id: str) -> str:
    return f"https://feishu.cn/docs/{doc_id}"


def now_iso_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_args(argv):
    if len(argv) < 3:
        print(
            "Usage: feishu-publisher.py <markdown_file_path> <title>",
            file=sys.stderr,
        )
        sys.exit(2)
    path = argv[1]
    title = argv[2].strip()
    if not title:
        print("Error: title must not be empty", file=sys.stderr)
        sys.exit(2)
    return path, title


def main() -> int:
    path, title = parse_args(sys.argv)
    content = read_file_safely(path)
    char_count = len(content)

    doc_id = build_doc_id()
    payload = {
        "doc_url": build_doc_url(doc_id),
        "doc_id": doc_id,
        "published_at": now_iso_utc(),
        "char_count": char_count,
        "title": title,
        "mock": True,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
