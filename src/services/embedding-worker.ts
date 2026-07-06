/**
 * Plan F Embedding Worker
 * 后台 poll pending jobs, 逐条调 embedText, update chunk.embedding
 * 失败 3 次重试 → 标 failed
 */
import { sql, eq, and, isNull, asc } from 'drizzle-orm';
import { db, pool } from '../db/index.js';
import { embeddingJobs, documentChunks, knowledgeBases, documents } from '../db/schema.js';
import { embedText } from './embedder.js';

const MAX_ATTEMPTS = 3;
let currentTimer: NodeJS.Timeout | null = null;

export interface ProcessResult {
  processed: boolean;
  jobId?: string;
  error?: string;
}

export async function processOneJob(): Promise<ProcessResult> {
  // 1. 拿一个 pending job (FOR UPDATE SKIP LOCKED 防并发)
  const pending = await pool.query(
    `SELECT id, doc_id, kb_id, tenant_id, total_chunks, attempts
     FROM embedding_jobs
     WHERE status = 'pending' AND attempts < $1
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED`,
    [MAX_ATTEMPTS],
  );
  const job = pending.rows[0];
  if (!job) return { processed: false };

  // 2. 标 processing, attempts+1
  await pool.query(
    `UPDATE embedding_jobs
     SET status = 'processing', attempts = attempts + 1
     WHERE id = $1`,
    [job.id],
  );

  try {
    // 3. 拿 doc 的 chunks (embedding IS NULL)
    const chunks = await pool.query(
      `SELECT id, content FROM document_chunks
       WHERE document_id = $1 AND embedding IS NULL
       ORDER BY chunk_index ASC`,
      [job.doc_id],
    );

    // 4. 拿 KB 的 embedding provider
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, job.kb_id)).limit(1);
    const providerId = kb?.embeddingProviderId || null;

    let embeddedCount = 0;
    for (const chunk of chunks.rows) {
      if (!providerId) {
        // 无 provider,embedding 留 null,标 completed (文档已存,只是没向量化)
        break;
      }
      const vec = await embedText({ providerId, text: chunk.content });
      if (vec) {
        // pgvector: '[1,2,3]' 格式
        const vecStr = `[${vec.join(',')}]`;
        await pool.query(
          `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
          [vecStr, chunk.id],
        );
        embeddedCount++;
      }
    }

    // 5. 标 completed (无论 embeddedCount 多少, chunks 已存)
    await pool.query(
      `UPDATE embedding_jobs
       SET status = 'completed', embedded_chunks = $1, completed_at = now(), error = NULL
       WHERE id = $2`,
      [embeddedCount, job.id],
    );
    return { processed: true, jobId: job.id };
  } catch (err) {
    const msg = (err as Error).message;
    // 失败: attempts+1 已经做了
    const newAttempts = (job.attempts || 0) + 1;
    if (newAttempts >= MAX_ATTEMPTS) {
      await pool.query(
        `UPDATE embedding_jobs SET status = 'failed', error = $1 WHERE id = $2`,
        [msg, job.id],
      );
    } else {
      // 重新 pending,等下次重试
      await pool.query(
        `UPDATE embedding_jobs SET status = 'pending', error = $1 WHERE id = $2`,
        [msg, job.id],
      );
    }
    return { processed: true, jobId: job.id, error: msg };
  }
}

export function startEmbeddingWorker(intervalMs?: number): NodeJS.Timeout {
  const envMs = process.env.EMBEDDING_WORKER_MS ? Number(process.env.EMBEDDING_WORKER_MS) : 0;
  const ms = intervalMs ?? (envMs || 5000);
  const timer = setInterval(() => {
    processOneJob().catch(err => console.error('[embedding-worker] poll failed', err));
  }, ms);
  if (typeof timer.unref === 'function') timer.unref();
  currentTimer = timer;
  console.log(`[embedding-worker] started, interval=${ms}ms`);
  return timer;
}

export function stopEmbeddingWorker(timer?: NodeJS.Timeout): void {
  const t = timer || currentTimer;
  if (t) {
    clearInterval(t);
    if (t === currentTimer) currentTimer = null;
  }
}
