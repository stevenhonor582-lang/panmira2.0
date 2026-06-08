#!/usr/bin/env python3
"""
hybrid-merge.py — 混合检索结果融合（加权 + RRF 重排）
输入: keyword JSON (--keyword) + vector JSON (--vector) [可选 mode=keyword/vector/hybrid]
输出: JSON {"results": [...], "confidence": float, "metadata": {...}}

融合公式：
  final = 0.7 * vector_score + 0.3 * keyword_score  (linear weighted)
  + RRF 重排 (k=60)
  + 截断 top-K

置信度：取 top-1 final_score，0-1 归一化
"""
from __future__ import annotations
import argparse
import json
import sys
import time
from typing import List, Dict


VECTOR_WEIGHT = 0.7
KEYWORD_WEIGHT = 0.3
RRF_K = 60


def load_json(path: str) -> Dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def make_key(r: Dict) -> str:
    """去重 key：chunk_id 优先，否则 source_id + chunk_index"""
    if "chunk_id" in r:
        return r["chunk_id"]
    return f"{r.get('source_id', 'unknown')}::{r.get('chunk_index', 0)}"


def linear_merge(kw_results: List[Dict], vec_results: List[Dict]) -> List[Dict]:
    """线性加权融合：final = 0.7 * vec + 0.3 * kw"""
    combined: Dict[str, Dict] = {}

    for r in vec_results:
        key = make_key(r)
        combined[key] = {
            "source_id": r.get("source_id", "unknown"),
            "chunk_index": r.get("chunk_index", 0),
            "chunk_id": r.get("chunk_id", key),
            "chunk_text": r.get("chunk_text", ""),
            "vector_score": r.get("score", 0.0),
            "keyword_score": 0.0,
            "score": VECTOR_WEIGHT * r.get("score", 0.0),
        }

    for r in kw_results:
        key = make_key(r)
        if key in combined:
            combined[key]["keyword_score"] = r.get("score", 0.0)
            combined[key]["score"] += KEYWORD_WEIGHT * r.get("score", 0.0)
        else:
            combined[key] = {
                "source_id": r.get("source_id", "unknown"),
                "chunk_index": r.get("chunk_index", 0),
                "chunk_id": r.get("chunk_id", key),
                "chunk_text": r.get("chunk_text", ""),
                "vector_score": 0.0,
                "keyword_score": r.get("score", 0.0),
                "score": KEYWORD_WEIGHT * r.get("score", 0.0),
            }

    return list(combined.values())


def rrf_rerank(merged: List[Dict], kw_results: List[Dict], vec_results: List[Dict]) -> List[Dict]:
    """RRF 重排：基于排名而非分数"""
    kw_ranks = {make_key(r): i + 1 for i, r in enumerate(kw_results)}
    vec_ranks = {make_key(r): i + 1 for i, r in enumerate(vec_results)}

    for item in merged:
        key = make_key(item)
        rrf_score = 0.0
        if key in vec_ranks:
            rrf_score += 1.0 / (RRF_K + vec_ranks[key])
        if key in kw_ranks:
            rrf_score += 1.0 / (RRF_K + kw_ranks[key])
        # RRF + 原始 linear score 综合
        item["rrf_score"] = round(rrf_score, 6)
        item["score"] = round(0.7 * item["score"] + 0.3 * rrf_score, 6)
    return merged


def compute_confidence(results: List[Dict]) -> float:
    """置信度：top-1 score，clamp 到 0-1"""
    if not results:
        return 0.0
    return round(min(1.0, max(0.0, results[0]["score"])), 4)


def main() -> int:
    parser = argparse.ArgumentParser(description="Hybrid merge (weighted + RRF)")
    parser.add_argument("--keyword", help="keyword search results JSON")
    parser.add_argument("--vector", help="vector search results JSON")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--mode", choices=["keyword", "vector", "hybrid"], default="hybrid")
    parser.add_argument("--query", default="")
    args = parser.parse_args()

    start = time.time()

    kw_results: List[Dict] = []
    vec_results: List[Dict] = []

    if args.keyword and args.mode in ("keyword", "hybrid"):
        kw_results = load_json(args.keyword).get("results", [])
    if args.vector and args.mode in ("vector", "hybrid"):
        vec_results = load_json(args.vector).get("results", [])

    if args.mode == "keyword":
        merged = [{"source_id": r.get("source_id", "unknown"),
                   "chunk_index": r.get("chunk_index", 0),
                   "chunk_id": r.get("chunk_id", make_key(r)),
                   "chunk_text": r.get("chunk_text", ""),
                   "vector_score": 0.0,
                   "keyword_score": r.get("score", 0.0),
                   "score": r.get("score", 0.0)} for r in kw_results]
    elif args.mode == "vector":
        merged = [{"source_id": r.get("source_id", "unknown"),
                   "chunk_index": r.get("chunk_index", 0),
                   "chunk_id": r.get("chunk_id", make_key(r)),
                   "chunk_text": r.get("chunk_text", ""),
                   "vector_score": r.get("score", 0.0),
                   "keyword_score": 0.0,
                   "score": r.get("score", 0.0)} for r in vec_results]
    else:
        merged = linear_merge(kw_results, vec_results)
        merged = rrf_rerank(merged, kw_results, vec_results)

    merged.sort(key=lambda x: x["score"], reverse=True)
    top = merged[:args.top_k]
    for r in top:
        r["score"] = round(r["score"], 6)

    confidence = compute_confidence(top)
    duration_ms = int((time.time() - start) * 1000)

    output = {
        "results": top,
        "confidence": confidence,
        "query": args.query,
        "mode": args.mode,
        "metadata": {
            "chunks_retrieved": len(top),
            "duration_ms": duration_ms,
            "vector_weight": VECTOR_WEIGHT if args.mode == "hybrid" else (1.0 if args.mode == "vector" else 0.0),
            "keyword_weight": KEYWORD_WEIGHT if args.mode == "hybrid" else (1.0 if args.mode == "keyword" else 0.0),
            "rrf_k": RRF_K if args.mode == "hybrid" else 0,
        }
    }

    json.dump(output, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
