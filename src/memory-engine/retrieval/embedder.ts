import { EMBEDDING_DIMENSION } from '../../core/constants.js';

export interface Embedder {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
}

export class OpenAIEmbedder implements Embedder {
  readonly dimensions = EMBEDDING_DIMENSION;
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config?: { apiKey?: string; model?: string; baseUrl?: string }) {
    this.apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY ?? '';
    this.model = config?.model ?? 'text-embedding-3-small';
    this.baseUrl = config?.baseUrl ?? 'https://api.openai.com/v1';
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.apiKey) {
      return texts.map(() => Array(this.dimensions).fill(0));
    }

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Embedding API error: ${response.status} ${err}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map((d) => d.embedding);
  }
}
