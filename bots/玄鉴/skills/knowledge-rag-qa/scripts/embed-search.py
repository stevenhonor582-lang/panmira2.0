#!/usr/bin/env python3
"""
embed-search.py — 向量检索（hash-based mock embedding + 余弦相似度）
输入: query (arg) + corpus JSON (--corpus)
输出: JSON {"results": [{"source_id", "chunk_index", "chunk_text", "score"}]}

实现：
- 无 numpy：纯 Python list[float] + dot product
- embedding：hash feature hashing（256-d 桶）
- 相似度：cosine = dot(a,b) / (||a|| * ||b||)
"""
from __future__ import annotations
import argparse
import json
import math
import re
import sys
from collections import Counter
from typing import List, Dict


EMBED_DIM = 256
TOKEN_RE = re.compile(r"[A-Za-z]+|[一-鿿]")


def tokenize(text: str) -> List[str]:
    """与 keyword-search 一致：中文 bigram + 英文单词"""
    if not text:
        return []
    text = text.lower()
    tokens: List[str] = []
    for m in TOKEN_RE.finditer(text):
        tok = m.group(0)
        if re.match(r"[一-鿿]", tok):
            chars = list(tok)
            for i in range(len(chars) - 1):
                tokens.append(chars[i] + chars[i + 1])
            if len(chars) == 1:
                tokens.append(chars[0])
        else:
            tokens.append(tok)
    return tokens


def hash_token(tok: str) -> int:
    """deterministic hash → bucket index"""
    h = 0
    for c in tok:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h % EMBED_DIM


def embed(text: str) -> List[float]:
    """feature-hashing embedding（带 sign trick）"""
    vec = [0.0] * EMBED_DIM
    if not text:
        return vec
    tokens = tokenize(text)
    if not tokens:
        return vec
    counts = Counter(tokens)
    for tok, cnt in counts.items():
        bucket = hash_token(tok)
        # sign trick: hash of (token + "salt") 决定 +/-
        sign = 1 if (hash_token(tok + "_s") % 2 == 0) else -1
        tf = 1 + math.log(cnt)
        vec[bucket] += sign * tf
    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec


def cosine(a: List[float], b: List[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    return max(0.0, min(1.0, dot))


def main() -> int:
    parser = argparse.ArgumentParser(description="Vector search (hash embedding + cosine)")
    parser.add_argument("query", help="search query")
    parser.add_argument("--corpus", required=True, help="corpus JSON file")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--field", default="text")
    args = parser.parse_args()

    with open(args.corpus, "r", encoding="utf-8") as f:
        corpus = json.load(f)

    chunks = corpus.get("chunks", corpus if isinstance(corpus, list) else [])
    if not chunks:
        json.dump({"results": []}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    q_vec = embed(args.query)
    if all(v == 0 for v in q_vec):
        json.dump({"results": []}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    scored: List[Dict] = []
    for i, chunk in enumerate(chunks):
        text = chunk.get(args.field, "")
        d_vec = embed(text)
        s = cosine(q_vec, d_vec)
        if s > 0:
            scored.append({
                "source_id": chunk.get("source_id", "unknown"),
                "chunk_index": chunk.get("chunk_index", i),
                "chunk_id": chunk.get("chunk_id", f"chunk-{i:04d}"),
                "chunk_text": text,
                "score": round(s, 6),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:args.top_k]

    json.dump({"results": top, "query": args.query, "mode": "vector"}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
