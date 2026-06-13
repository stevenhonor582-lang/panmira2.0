import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chunkText } from './chunker.js';
import { VectorIndex } from './vector-index.js';
import type { Embedder } from './embedder.js';

interface Manifest {
  docs: Array<{ id: string; name: string }>;
}

export interface IndexerOptions {
  kbDir: string;
  docId: string;
  docName: string;
  rawPath: string;
  embedder: Pick<Embedder, 'embedBatch'>;
  manifestPath?: string;
}

export class Indexer {
  private opts: IndexerOptions;

  constructor(opts: IndexerOptions) {
    this.opts = opts;
  }

  async run(): Promise<void> {
    const { kbDir, docId, docName, rawPath, embedder } = this.opts;
    const docDir = join(kbDir, docId);
    mkdirSync(docDir, { recursive: true });

    const text = readFileSync(rawPath, 'utf-8');

    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    const vectors = await embedder.embedBatch(chunks.map((c) => c.text));

    const index = new VectorIndex(join(docDir, 'chunks.db'));
    try {
      index.init();
      index.insertChunks(
        chunks.map((c, i) => ({
          docId,
          docName,
          position: c.position,
          text: c.text,
          vector: vectors[i],
        })),
      );
    } finally {
      index.close();
    }

    const manifestPath = this.opts.manifestPath ?? join(kbDir, 'manifest.json');
    let manifest: Manifest = { docs: [] };
    if (existsSync(manifestPath)) {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
    }
    if (!manifest.docs.find((d) => d.id === docId)) {
      manifest.docs.push({ id: docId, name: docName });
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  }
}

/**
 * Fire-and-forget background indexing kickoff.
 * Constructs an Indexer and runs it asynchronously on the next tick.
 * Errors are swallowed (logged) so they never bubble back into upload flow.
 */
export function triggerBackgroundIndexing(
  opts: IndexerOptions,
  onError?: (err: unknown) => void,
): void {
  setImmediate(() => {
    new Indexer(opts)
      .run()
      .catch((err) => {
        if (onError) onError(err);
        else console.error('[indexer] background indexing failed:', err);
      });
  });
}
