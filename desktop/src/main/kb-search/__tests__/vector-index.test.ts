import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorIndex } from '../vector-index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('VectorIndex', () => {
  let dir: string;
  let index: VectorIndex;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vec-'));
    index = new VectorIndex(join(dir, 'chunks.db'));
    index.init();
  });

  afterEach(() => {
    index.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('inserts and queries a single chunk', () => {
    const vec = new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0));
    index.insertChunks([{ docId: 'd1', docName: 'doc.pdf', position: 0, text: 'hello', vector: vec }]);
    const results = index.search(vec, 5);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('hello');
    expect(results[0].score).toBeCloseTo(1.0, 5);
  });

  it('returns top-K ordered by similarity', () => {
    const make = (i: number) => new Array(1536).fill(0).map((_, j) => (j === i ? 1 : 0));
    index.insertChunks([
      { docId: 'd1', docName: 'a.pdf', position: 0, text: 'a', vector: make(0) },
      { docId: 'd2', docName: 'b.pdf', position: 0, text: 'b', vector: make(1) },
      { docId: 'd3', docName: 'c.pdf', position: 0, text: 'c', vector: make(2) },
    ]);
    const query = make(0);
    const results = index.search(query, 2);
    expect(results[0].text).toBe('a');
    expect(results).toHaveLength(2);
  });

  it('persists across reopens', () => {
    const vec = new Array(1536).fill(1);
    index.insertChunks([{ docId: 'd1', docName: 'x.pdf', position: 0, text: 'persist', vector: vec }]);
    index.close();

    const index2 = new VectorIndex(join(dir, 'chunks.db'));
    index2.init();
    const results = index2.search(vec, 5);
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe('persist');
    index2.close();
  });

  it('count() returns inserted chunk count', () => {
    const vec = new Array(1536).fill(0);
    expect(index.count()).toBe(0);
    index.insertChunks([
      { docId: 'd1', docName: 'a.pdf', position: 0, text: 'a', vector: vec },
      { docId: 'd1', docName: 'a.pdf', position: 1, text: 'b', vector: vec },
    ]);
    expect(index.count()).toBe(2);
  });
});
