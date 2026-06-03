import type { StorageBackend } from '../storage/types.js';
import type { Embedder } from './embedder.js';
import type { MemoryQuery, MemoryResult } from '../../core/types.js';
import { MemoryLayer, DEFAULT_SIMILARITY_THRESHOLD } from '../../core/constants.js';

const RRF_K = 60;

export class VectorRetriever {
  constructor(
    private storage: StorageBackend,
    private embedder: Embedder,
  ) {}

  async retrieve(query: MemoryQuery): Promise<MemoryResult[]> {
    const { query: text, userId, layers, limit, threshold } = query;
    const layerValues = layers ?? [MemoryLayer.USER];
    const opts = {
      layers: layerValues.map((l) => l as number),
      limit: limit ?? 5,
      threshold: threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
    };

    const [keywordResults, vectorResults] = await Promise.allSettled([
      this.storage.retrieve(text, userId, opts),
      (async () => {
        try {
          const [embedding] = await this.embedder.embedBatch([text]);
          if (embedding.every((v) => v === 0)) return [];
          return this.storage.retrieveVector(embedding, userId, opts);
        } catch {
          return [];
        }
      })(),
    ]);

    const kw = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    const vec = vectorResults.status === 'fulfilled' ? vectorResults.value : [];

    if (vec.length === 0) {
      for (const r of kw) await this.storage.updateAccess(r.memory.id).catch(() => {});
      return kw;
    }

    // Reciprocal Rank Fusion
    const scoreMap = new Map<string, { result: MemoryResult; score: number }>();
    for (const r of kw) {
      scoreMap.set(r.memory.id, { result: r, score: 1 / (RRF_K + r.rank) });
    }
    for (const r of vec) {
      const existing = scoreMap.get(r.memory.id);
      if (existing) {
        existing.score += 1 / (RRF_K + r.rank);
      } else {
        scoreMap.set(r.memory.id, { result: r, score: 1 / (RRF_K + r.rank) });
      }
    }

    const fused = [...scoreMap.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit)
      .map((item, i) => ({
        memory: item.result.memory,
        similarity: item.result.similarity,
        rank: i + 1,
      }));

    for (const r of fused) await this.storage.updateAccess(r.memory.id).catch(() => {});
    return fused;
  }
}
