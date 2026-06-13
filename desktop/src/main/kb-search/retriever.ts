import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Embedder, Embedding } from './embedder.js';
import { VectorIndex } from './vector-index.js';
import type { KbChunk } from '../../shared/ipc-contract.js';

interface Manifest {
  docs: Array<{ id: string; name: string }>;
}

export interface RetrieverOptions {
  kbDir: string;
  manifestPath: string;
  embedder: Pick<Embedder, 'embed'>;
}

export class Retriever {
  private kbDir: string;
  private manifestPath: string;
  private embedder: Pick<Embedder, 'embed'>;

  constructor(opts: RetrieverOptions) {
    this.kbDir = opts.kbDir;
    this.manifestPath = opts.manifestPath;
    this.embedder = opts.embedder;
  }

  async retrieve(args: { query: string; topK?: number }): Promise<KbChunk[]> {
    const topK = args.topK ?? 5;
    const manifest = this.readManifest();
    if (manifest.docs.length === 0) return [];

    const queryVec: Embedding = await this.embedder.embed(args.query);

    const allResults: KbChunk[] = [];
    for (const doc of manifest.docs) {
      const index = new VectorIndex(join(this.kbDir, doc.id, 'chunks.db'));
      try {
        index.init();
        const results = index.search(queryVec, topK);
        for (const r of results) {
          allResults.push({
            docId: r.docId,
            docName: r.docName,
            position: r.position,
            text: r.text,
            score: r.score,
          });
        }
      } finally {
        index.close();
      }
    }

    allResults.sort((a, b) => b.score - a.score);
    return allResults.slice(0, topK);
  }

  private readManifest(): Manifest {
    try {
      const raw = readFileSync(this.manifestPath, 'utf-8');
      return JSON.parse(raw) as Manifest;
    } catch {
      return { docs: [] };
    }
  }
}
