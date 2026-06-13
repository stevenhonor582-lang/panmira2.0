export type Embedding = number[]; // 1536 dims for text-embedding-3-small

export interface EmbedderOptions {
  apiKey: string;
  baseUrl: string;
  model?: string;
  fetch?: typeof fetch;
}

export class Embedder {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private fetchFn: typeof fetch;

  constructor(opts: EmbedderOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.model = opts.model ?? 'text-embedding-3-small';
    this.fetchFn = opts.fetch ?? fetch;
  }

  async embed(text: string): Promise<Embedding> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<Embedding[]> {
    const res = await this.fetchFn(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, input: texts }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Embedder ${res.status}: ${body}`);
    }

    const json = (await res.json()) as { data: { embedding: Embedding }[] };
    return json.data.map((d) => d.embedding);
  }
}
