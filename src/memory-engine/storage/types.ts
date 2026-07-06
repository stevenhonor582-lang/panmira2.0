import type { Memory, MemoryResult } from '../../core/types.js';

export interface StorageBackend {
  store(memory: Memory): Promise<string>;
  retrieve(
    query: string,
    userId: string,
    botId?: string,
    options?: { layers?: number[]; limit?: number; threshold?: number },
  ): Promise<MemoryResult[]>;
  retrieveVector(
    embedding: number[],
    userId: string,
    botId?: string,
    options?: { layers?: number[]; limit?: number; threshold?: number },
  ): Promise<MemoryResult[]>;
  updateAccess(id: string): Promise<void>;
  delete(id: string): Promise<void>;
  deleteByUser(userId: string): Promise<number>;
}
