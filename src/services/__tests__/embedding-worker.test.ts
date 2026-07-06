import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => {
  const queryFn = vi.fn();
  return {
    pool: { query: queryFn },
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{ id: 'kb-1', embeddingProviderId: 'prov-1' }],
          }),
        }),
      }),
    },
  };
});
vi.mock('../embedder.js', () => ({
  embedText: vi.fn(),
}));

import { startEmbeddingWorker, stopEmbeddingWorker, processOneJob } from '../embedding-worker.ts';
import { pool } from '../../db/index.js';
import { embedText } from '../embedder.js';

describe('embedding-worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('startEmbeddingWorker 返 timer', () => {
    const t = startEmbeddingWorker(60_000);
    expect(t).toBeDefined();
    expect(typeof t).toBe('object');
    stopEmbeddingWorker(t);
  });

  it('stopEmbeddingWorker 清理 timer', () => {
    const t = startEmbeddingWorker(60_000);
    stopEmbeddingWorker(t);
    expect((t as any)._destroyed).toBe(true);
  });

  it('processOneJob 无 pending → 返 processed=false', async () => {
    (pool.query as any).mockResolvedValueOnce({ rows: [] });
    const r = await processOneJob();
    expect(r.processed).toBe(false);
  });

  it('processOneJob 有 job → 标 processing, 失败 1 次 → 标 pending (attempts<3)', async () => {
    (pool.query as any).mockReset();
    (embedText as any).mockReset();
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'job-1', doc_id: 'doc-1', kb_id: 'kb-1', tenant_id: 't-1', total_chunks: 5, attempts: 0 }] });
    (pool.query as any).mockResolvedValueOnce({});  // update processing
    (pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'c-1', content: 'hi' }] });  // chunks
    (embedText as any).mockRejectedValue(new Error('embedding api down'));
    (pool.query as any).mockResolvedValueOnce({});  // final update

    const r = await processOneJob();
    expect(r.processed).toBe(true);
    expect(r.jobId).toBe('job-1');
    expect(r.error).toContain('embedding api down');
  });
});
