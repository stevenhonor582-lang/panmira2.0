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
    const { query: text, userId, botId, layers, limit, threshold } = query;
    // 2026-06-27 commit 3: 默认搜全部 layer (之前只搜 layer=1 导致 254/264 scraper-kit 永远召回不到)
    const layerValues = layers ?? [MemoryLayer.RAW, MemoryLayer.USER, MemoryLayer.AGENT, MemoryLayer.SHARED];
    const opts = {
      layers: layerValues.map((l) => l as number),
      limit: limit ?? 5,
      threshold: threshold ?? DEFAULT_SIMILARITY_THRESHOLD,
      botId,  // 2026-06-27: 透传 botId
    } as any;

    const [keywordResults, vectorResults] = await Promise.allSettled([
      this.storage.retrieve(text, userId, botId, opts),
      (async () => {
        try {
          const [embedding] = await this.embedder.embedBatch([text]);
          if (embedding.every((v) => v === 0)) return [];
          return this.storage.retrieveVector(embedding, userId, botId, opts);
        } catch {
          return [];
        }
      })(),
    ]);

    const kw = keywordResults.status === 'fulfilled' ? keywordResults.value : [];
    const vec = vectorResults.status === 'fulfilled' ? vectorResults.value : [];

    if (vec.length === 0) {
      for (const r of kw) await this.storage
        .updateAccess(r.memory.id)
        .catch((err: any) => console.error('[retriever] updateAccess failed', { id: r.memory.id, err: err?.message }));
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

    for (const r of fused) await this.storage
        .updateAccess(r.memory.id)
        .catch((err: any) => console.error('[retriever] updateAccess failed', { id: r.memory.id, err: err?.message }));
    return fused;
  }
}
