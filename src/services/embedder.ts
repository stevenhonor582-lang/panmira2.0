/**
 * Plan B-2 嵌入服务
 * 根据 embeddingProviderId 从 DB 读 provider config,调 embeddings API
 * 失败重试 3 次,最终降级返回 null(让 chunk 仍然入库但无 embedding)
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { embeddingProviders } from '../db/schema.js';

export interface EmbedOptions {
  providerId: string;
  text: string;
  timeoutMs?: number;
}

export interface EmbedderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  dimensions: number;
}

const DEFAULT_TIMEOUT = 15000;

export async function loadEmbedder(providerId: string): Promise<EmbedderConfig | null> {
  const [row] = await db.select().from(embeddingProviders).where(eq(embeddingProviders.id, providerId)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    baseUrl: row.baseUrl || 'https://api.openai.com/v1',
    apiKey: row.apiKeyEncrypted || '',
    modelName: row.modelName || 'text-embedding-3-small',
    dimensions: row.dimensions || 1024,
  };
}

export async function embedText(opts: EmbedOptions): Promise<number[] | null> {
  const cfg = await loadEmbedder(opts.providerId);
  if (!cfg) return null;
  if (!cfg.apiKey) {
    // 没有 API key,降级返回零向量(测试用)
    return Array(cfg.dimensions).fill(0);
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT);
      const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: cfg.modelName, input: opts.text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        const errText = await response.text();
        lastError = new Error(`Embedding API ${response.status}: ${errText.slice(0, 200)}`);
        continue;
      }
      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      const vec = data.data[0]?.embedding;
      if (!vec || vec.length === 0) {
        lastError = new Error('Embedding API returned empty vector');
        continue;
      }
      return vec;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  // 3 次都失败,降级返回 null
  console.error(`[embedder] failed after 3 attempts: ${lastError?.message}`);
  return null;
}

export async function embedBatch(opts: { providerId: string; texts: string[]; timeoutMs?: number }): Promise<Array<number[] | null>> {
  const cfg = await loadEmbedder(opts.providerId);
  if (!cfg || !cfg.apiKey) {
    return opts.texts.map(() => cfg ? Array(cfg.dimensions).fill(0) : null);
  }
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || DEFAULT_TIMEOUT);
      const response = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: cfg.modelName, input: opts.texts }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        lastError = new Error(`Embedding batch API ${response.status}`);
        continue;
      }
      const data = await response.json() as { data: Array<{ embedding: number[] }> };
      return data.data.map(d => d.embedding);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  console.error(`[embedder] batch failed after 3 attempts: ${lastError?.message}`);
  return opts.texts.map(() => null);
}
