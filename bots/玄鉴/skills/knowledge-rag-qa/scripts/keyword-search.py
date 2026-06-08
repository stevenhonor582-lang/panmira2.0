#!/usr/bin/env python3
"""
keyword-search.py — 关键词检索（TF-IDF + 简单 BM25 风格）
输入: query (arg) + corpus JSON (--corpus)
输出: JSON {"results": [{"source_id", "chunk_index", "chunk_text", "score"}]}

实现：纯 stdlib 的 TF-IDF 评分（log 归一化的 IDF）
"""
from __future__ import annotations
import argparse
import json
import math
import re
import sys
from collections import Counter
from typing import List, Dict


# 中英文混合分词：英文按词，中文按字符 bigram
TOKEN_RE = re.compile(r"[A-Za-z]+|[一-鿿]")


def tokenize(text: str) -> List[str]:
    """中英文混合分词"""
    if not text:
        return []
    text = text.lower()
    tokens: List[str] = []
    for m in TOKEN_RE.finditer(text):
        tok = m.group(0)
        if re.match(r"[一-鿿]", tok):
            # 中文：拆 bigram
            chars = list(tok)
            for i in range(len(chars) - 1):
                tokens.append(chars[i] + chars[i + 1])
            if len(chars) == 1:
                tokens.append(chars[0])
        else:
            tokens.append(tok)
    return tokens


def compute_idf(docs: List[List[str]]) -> Dict[str, float]:
    """IDF = log((N + 1) / (df + 1)) + 1"""
    n = len(docs)
    df: Counter = Counter()
    for d in docs:
        for term in set(d):
            df[term] += 1
    return {term: math.log((n + 1) / (df_t + 1)) + 1 for term, df_t in df.items()}


def score_doc(query_tokens: List[str], doc_tokens: List[str],
              idf: Dict[str, float]) -> float:
    """TF-IDF 余弦相似（简化为 dot product + 长度归一化）"""
    if not query_tokens or not doc_tokens:
        return 0.0
    qc = Counter(query_tokens)
    dc = Counter(doc_tokens)
    score = 0.0
    for term, qf in qc.items():
        if term in dc:
            tf = 1 + math.log(dc[term])  # log 归一化 TF
            score += qf * tf * idf.get(term, 0.0)
    # 长度归一化
    norm = math.sqrt(sum((1 + math.log(c)) ** 2 for c in dc.values()))
    if norm > 0:
        score /= norm
    return score


def main() -> int:
    parser = argparse.ArgumentParser(description="Keyword search (TF-IDF)")
    parser.add_argument("query", help="search query")
    parser.add_argument("--corpus", required=True, help="corpus JSON file")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--field", default="text", help="chunk field to search")
    args = parser.parse_args()

    with open(args.corpus, "r", encoding="utf-8") as f:
        corpus = json.load(f)

    chunks = corpus.get("chunks", corpus if isinstance(corpus, list) else [])
    if not chunks:
        json.dump({"results": []}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    query_tokens = tokenize(args.query)
    if not query_tokens:
        json.dump({"results": []}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0

    doc_token_lists = [tokenize(c.get(args.field, "")) for c in chunks]
    idf = compute_idf(doc_token_lists)

    scored: List[Dict] = []
    for i, (chunk, dtoks) in enumerate(zip(chunks, doc_token_lists)):
        s = score_doc(query_tokens, dtoks, idf)
        if s > 0:
            scored.append({
                "source_id": chunk.get("source_id", "unknown"),
                "chunk_index": chunk.get("chunk_index", i),
                "chunk_id": chunk.get("chunk_id", f"chunk-{i:04d}"),
                "chunk_text": chunk.get(args.field, ""),
                "score": round(s, 6),
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    top = scored[:args.top_k]

    json.dump({"results": top, "query": args.query, "mode": "keyword"}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
