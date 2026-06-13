import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Retriever } from '../retriever.js';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Retriever', () => {
  let kbDir: string;
  let manifestPath: string;

  beforeEach(() => {
    kbDir = mkdtempSync(join(tmpdir(), 'kb-'));
    mkdirSync(join(kbDir, 'doc1'), { recursive: true });
    mkdirSync(join(kbDir, 'doc2'), { recursive: true });
    writeFileSync(join(kbDir, 'doc1', 'chunks.db'), '');
    writeFileSync(join(kbDir, 'doc2', 'chunks.db'), '');
    writeFileSync(
      join(kbDir, 'manifest.json'),
      JSON.stringify({ docs: [{ id: 'doc1', name: 'a.pdf' }, { id: 'doc2', name: 'b.pdf' }] }),
    );
    manifestPath = join(kbDir, 'manifest.json');
  });

  afterEach(() => {
    rmSync(kbDir, { recursive: true, force: true });
  });

  it('returns top-K across multiple doc indices', async () => {
    const embedder = {
      embed: vi.fn().mockResolvedValue(new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0))),
    };
    const retriever = new Retriever({ kbDir, manifestPath, embedder });

    const { VectorIndex } = await import('../vector-index.js');
    const idx1 = new VectorIndex(join(kbDir, 'doc1', 'chunks.db'));
    idx1.init();
    idx1.insertChunks([
      { docId: 'doc1', docName: 'a.pdf', position: 0, text: 'A', vector: new Array(1536).fill(0).map((_, i) => (i === 0 ? 1 : 0)) },
    ]);
    idx1.close();
    const idx2 = new VectorIndex(join(kbDir, 'doc2', 'chunks.db'));
    idx2.init();
    idx2.insertChunks([
      { docId: 'doc2', docName: 'b.pdf', position: 0, text: 'B', vector: new Array(1536).fill(0).map((_, i) => (i === 1 ? 1 : 0)) },
    ]);
    idx2.close();

    const results = await retriever.retrieve({ query: 'q', topK: 5 });
    expect(results.length).toBe(2);
    expect(results[0].text).toBe('A'); // higher score
  });

  it('returns empty when KB is empty', async () => {
    const embedder = { embed: vi.fn().mockResolvedValue(new Array(1536).fill(0)) };
    const retriever = new Retriever({ kbDir, manifestPath, embedder });
    const results = await retriever.retrieve({ query: 'q', topK: 5 });
    expect(results).toEqual([]);
  });
});
