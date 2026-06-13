import { describe, it, expect, vi } from 'vitest';
import { Embedder } from '../embedder.js';

describe('Embedder', () => {
  it('returns 1536-dim vector for a single text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: new Array(1536).fill(0.1) }] }),
    });
    const embedder = new Embedder({
      apiKey: 'test-key',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const vec = await embedder.embed('hello world');
    expect(vec).toHaveLength(1536);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('batches multiple texts into one API call', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { embedding: new Array(1536).fill(0.1) },
          { embedding: new Array(1536).fill(0.2) },
        ],
      }),
    });
    const embedder = new Embedder({
      apiKey: 'test',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    const vecs = await embedder.embedBatch(['a', 'b']);
    expect(vecs).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws with descriptive error on API failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    });
    const embedder = new Embedder({
      apiKey: 'test',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock as unknown as typeof fetch,
    });
    let caught: Error | null = null;
    try {
      await embedder.embed('x');
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/429/);
  });
});
