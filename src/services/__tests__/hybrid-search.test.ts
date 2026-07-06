import { describe, it, expect } from 'vitest';
import { rrfFuse, type SearchResult } from '../hybrid-search.ts';

describe('rrfFuse 纯函数', () => {
  it('空输入返回空', () => {
    expect(rrfFuse([], [], 5)).toEqual([]);
  });

  it('只有 vector 结果', () => {
    const v: SearchResult[] = [
      { chunkId: 'c1', documentId: 'd1', content: 'A', score: 0.9 },
      { chunkId: 'c2', documentId: 'd1', content: 'B', score: 0.8 },
    ];
    const result = rrfFuse(v, [], 5);
    expect(result.length).toBe(2);
    // rank 1 → 1/61
    expect(result[0]!.chunkId).toBe('c1');
    expect(result[0]!.score).toBeCloseTo(1 / 61, 5);
    expect(result[0]!.vectorRank).toBe(1);
    expect(result[0]!.bm25Rank).toBeUndefined();
  });

  it('只有 bm25 结果', () => {
    const b: SearchResult[] = [
      { chunkId: 'c1', documentId: 'd1', content: 'A', score: 5.0 },
    ];
    const result = rrfFuse([], b, 5);
    expect(result.length).toBe(1);
    expect(result[0]!.score).toBeCloseTo(1 / 61, 5);
    expect(result[0]!.bm25Rank).toBe(1);
  });

  it('RRF 融合: 同一 chunk 在两路都出现', () => {
    const v: SearchResult[] = [
      { chunkId: 'c1', documentId: 'd1', content: 'A', score: 0.9 },
      { chunkId: 'c2', documentId: 'd1', content: 'B', score: 0.8 },
    ];
    const b: SearchResult[] = [
      { chunkId: 'c2', documentId: 'd1', content: 'B', score: 5.0 },
      { chunkId: 'c1', documentId: 'd1', content: 'A', score: 4.0 },
    ];
    const result = rrfFuse(v, b, 5);
    expect(result.length).toBe(2);
    // 两者 swap rank: c1 rank 1 in v + rank 2 in bm25 = 1/61 + 1/62
    // c2 rank 2 in v + rank 1 in bm25 = 1/62 + 1/61 (tied)
    const expected = 1 / 61 + 1 / 62;
    expect(result[0]!.score).toBeCloseTo(expected, 5);
    expect(result[1]!.score).toBeCloseTo(expected, 5);
  });

  it('chunks 只在一路出现也包含', () => {
    const v: SearchResult[] = [
      { chunkId: 'c1', documentId: 'd1', content: 'A', score: 0.9 },
    ];
    const b: SearchResult[] = [
      { chunkId: 'c2', documentId: 'd2', content: 'B', score: 5.0 },
    ];
    const result = rrfFuse(v, b, 5);
    expect(result.length).toBe(2);
    expect(result.some(r => r.chunkId === 'c1')).toBe(true);
    expect(result.some(r => r.chunkId === 'c2')).toBe(true);
  });

  it('topN 限制返回数量', () => {
    const v: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `c${i}`, documentId: 'd1', content: '', score: 1.0 - i * 0.1,
    }));
    const result = rrfFuse(v, [], 3);
    expect(result.length).toBe(3);
  });

  it('k 参数影响分数 (k=10 分数更高)', () => {
    const v: SearchResult[] = [{ chunkId: 'c1', documentId: 'd1', content: 'A', score: 0.9 }];
    const r1 = rrfFuse(v, [], 5, 10);
    const r2 = rrfFuse(v, [], 5, 60);
    expect(r1[0]!.score).toBeGreaterThan(r2[0]!.score);
    expect(r1[0]!.score).toBeCloseTo(1 / 11, 5);
    expect(r2[0]!.score).toBeCloseTo(1 / 61, 5);
  });
});

describe('SearchResult 形状', () => {
  it('包含必需字段', () => {
    const r: SearchResult = { chunkId: 'c1', documentId: 'd1', content: 'X', score: 0.5 };
    expect(r.chunkId).toBeDefined();
    expect(r.documentId).toBeDefined();
    expect(r.content).toBeDefined();
    expect(r.score).toBeDefined();
  });
});
