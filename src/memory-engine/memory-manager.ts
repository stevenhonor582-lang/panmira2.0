import { randomUUID } from 'node:crypto';
import { MemoryLayer } from '../core/constants.js';
import type { Memory, MemoryQuery, MemoryResult } from '../core/types.js';
import type { StorageBackend } from './storage/types.js';
import type { Embedder } from './retrieval/embedder.js';
import { VectorRetriever } from './retrieval/retriever.js';
import { ContextSynthesizer } from './retrieval/synthesizer.js';

export class MemoryManager {
  private retriever: VectorRetriever;
  private synthesizer = new ContextSynthesizer();

  constructor(
    private storage: StorageBackend,
    private embedder: Embedder,
  ) {
    this.retriever = new VectorRetriever(storage, embedder);
  }

  async store(content: string, userId: string, tenantId: string, options?: { layer?: MemoryLayer; agentId?: string; importance?: number }): Promise<string> {
    let embedding: number[] | undefined;
    try {
      [embedding] = await this.embedder.embedBatch([content]);
    } catch {}

    const memory: Memory = {
      id: randomUUID(),
      content,
      layer: options?.layer ?? MemoryLayer.USER,
      userId,
      agentId: options?.agentId,
      tenantId,
      importance: options?.importance ?? 0.5,
      accessCount: 0,
      embedding,
      metadata: {},
      createdAt: new Date(),
    };

    return this.storage.store(memory);
  }

  async retrieve(query: MemoryQuery): Promise<MemoryResult[]> {
    return this.retriever.retrieve(query);
  }

  async synthesize(query: string, userId: string, options?: { layers?: MemoryLayer[]; limit?: number }): Promise<string> {
    const results = await this.retriever.retrieve({
      query,
      userId,
      layers: options?.layers,
      limit: options?.limit ?? 5,
    });
    return this.synthesizer.synthesize(results, query);
  }

  async forget(id: string): Promise<void> {
    await this.storage.delete(id);
  }

  async forgetUser(userId: string): Promise<number> {
    return this.storage.deleteByUser(userId);
  }
}
