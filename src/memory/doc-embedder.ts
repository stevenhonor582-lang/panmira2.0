import { pool } from '../db/index.js';
import { decrypt } from '../db/crypto.js';
import type { Logger } from '../utils/logger.js';

const DEFAULT_DIMENSIONS = 1024;

export class DocEmbedder {
  readonly dimensions: number;
  private apiKey: string | null = null;
  private baseUrl: string = '';
  private model: string = '';
  private initPromise: Promise<void> | null = null;

  constructor(private logger: Logger) {
    this.dimensions = DEFAULT_DIMENSIONS;
  }

  private async ensureInit(): Promise<void> {
    if (this.apiKey) return;
    if (!this.initPromise) {
      this.initPromise = this.loadConfig();
    }
    await this.initPromise;
  }

  private async loadConfig(): Promise<void> {
    try {
      // 1. Look for provider with type='embedding' first
      const { rows } = await pool.query(
        "SELECT api_key_encrypted, base_url, model FROM provider_configs WHERE type = 'embedding' AND is_default = true LIMIT 1",
      );

      if (rows[0]?.api_key_encrypted) {
        this.apiKey = decrypt(rows[0].api_key_encrypted);
        this.baseUrl = (rows[0].base_url || '').replace(/\/+$/, '');
        this.model = rows[0].model || 'BAAI/bge-m3';
        this.logger.info({ baseUrl: this.baseUrl, model: this.model }, 'DocEmbedder: loaded from provider_configs');
        return;
      }

      // 2. Fallback: try siliconflow env var
      const sfKey = process.env.SILICONFLOW_API_KEY;
      if (sfKey) {
        this.apiKey = sfKey;
        this.baseUrl = 'https://api.siliconflow.cn/v1';
        this.model = 'BAAI/bge-m3';
        this.logger.info('DocEmbedder: using SILICONFLOW_API_KEY env var');
        return;
      }

      // 3. Fallback: try BigModel/Zhipu provider
      const { rows: zhipuRows } = await pool.query(
        "SELECT api_key_encrypted, base_url FROM provider_configs WHERE base_url LIKE '%bigmodel%' LIMIT 1",
      );
      if (zhipuRows[0]?.api_key_encrypted) {
        this.apiKey = decrypt(zhipuRows[0].api_key_encrypted);
        this.baseUrl = (zhipuRows[0].base_url || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/+$/, '');
        this.model = 'embedding-3';
        this.logger.info({ baseUrl: this.baseUrl }, 'DocEmbedder: using Zhipu/BigModel provider');
        return;
      }

      this.logger.warn('DocEmbedder: no embedding provider configured, embeddings disabled');
    } catch (err: any) {
      this.logger.error({ err: err.message }, 'DocEmbedder: failed to load config');
    }
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    await this.ensureInit();
    if (!this.apiKey) {
      return texts.map(() => Array(this.dimensions).fill(0));
    }

    const input = texts.map((t) => t.slice(0, 2000));
    const endpoint = `${this.baseUrl}/embeddings`;

    const maxRetries = 3;
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: this.model, input, encoding_format: 'float' }),
        });

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Embedding API error: ${response.status} ${err}`);
        }

        const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
        return data.data.map((d) => d.embedding);
      } catch (err: any) {
        lastErr = err;
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn({ attempt: attempt + 1, delay, err: err.message }, 'Embedding API failed, retrying');
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    this.logger.error({ err: lastErr?.message, texts: texts.length }, 'Embedding API failed after all retries, returning zero vectors');
    return texts.map(() => Array(this.dimensions).fill(0));
  }

  /** Health check: verify the embedding provider is configured and responsive */
  async healthCheck(): Promise<{ configured: boolean; ok: boolean; model: string | null; baseUrl: string | null; error?: string }> {
    await this.ensureInit();
    if (!this.apiKey) {
      return { configured: false, ok: false, model: null, baseUrl: null };
    }

    try {
      const result = await this.embedBatch(["health"]);
      const embedding = result[0];
      const nonZero = embedding.filter((v: number) => v !== 0).length;
      if (nonZero === 0) {
        return { configured: true, ok: false, model: this.model, baseUrl: this.baseUrl, error: "API returned zero vectors (silent failure)" };
      }
      return { configured: true, ok: true, model: this.model, baseUrl: this.baseUrl };
    } catch (err: any) {
      return { configured: true, ok: false, model: this.model, baseUrl: this.baseUrl, error: err.message };
    }
  }
}
