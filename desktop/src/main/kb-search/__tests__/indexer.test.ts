import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Indexer } from '../indexer.js';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Indexer', () => {
  let kbDir: string;
  let docDir: string;
  let rawPath: string;

  beforeEach(() => {
    kbDir = mkdtempSync(join(tmpdir(), 'kb-idx-'));
    docDir = join(kbDir, 'doc1');
    mkdirSync(docDir, { recursive: true });
    rawPath = join(docDir, 'raw.txt');
  });

  afterEach(() => {
    rmSync(kbDir, { recursive: true, force: true });
  });

  it('chunks, embeds, and writes chunks.db for a text file', async () => {
    writeFileSync(rawPath, 'Hello world. '.repeat(100));
    const embedder = {
      embedBatch: vi.fn().mockResolvedValue([new Array(1536).fill(0.1), new Array(1536).fill(0.2)]),
    };
    const indexer = new Indexer({ kbDir, docId: 'doc1', docName: 'doc1.txt', rawPath, embedder });
    await indexer.run();

    expect(existsSync(join(docDir, 'chunks.db'))).toBe(true);
    expect(embedder.embedBatch).toHaveBeenCalled();
  });

  it('updates manifest after indexing', async () => {
    writeFileSync(rawPath, 'tiny text');
    const embedder = {
      embedBatch: vi.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
    };
    const indexer = new Indexer({
      kbDir,
      docId: 'doc1',
      docName: 'doc1.txt',
      rawPath,
      embedder,
      manifestPath: join(kbDir, 'manifest.json'),
    });
    await indexer.run();
    const manifest = JSON.parse(readFileSync(join(kbDir, 'manifest.json'), 'utf-8'));
    expect(manifest.docs).toHaveLength(1);
    expect(manifest.docs[0].name).toBe('doc1.txt');
  });
});
