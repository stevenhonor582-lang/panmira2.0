/**
 * Re-embed chunks that have no embedding.
 * Usage: DATABASE_URL=... npx tsx src/memory/backfill-embeddings.ts
 */
import { pool } from '../db/index.js';
import { DocEmbedder } from './doc-embedder.js';
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  },
});
const BATCH_SIZE = 5;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const embedder = new DocEmbedder(logger);

  const { rows } = await pool.query('SELECT id, content FROM document_chunks WHERE embedding IS NULL ORDER BY id');
  if (rows.length === 0) {
    logger.info('All chunks already embedded');
    process.exit(0);
  }

  logger.info({ count: rows.length }, 'Chunks to embed');

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const texts = batch.map((r: any) => (r.content as string).slice(0, 2000));

    try {
      const embeddings = await embedder.embedBatch(texts);
      for (let j = 0; j < batch.length; j++) {
        const emb = embeddings[j];
        if (emb && !emb.every((v: number) => v === 0)) {
          await pool.query('UPDATE document_chunks SET embedding = $1 WHERE id = $2', [
            JSON.stringify(emb),
            batch[j].id,
          ]);
        } else {
          logger.warn({ chunkId: batch[j].id }, 'Zero embedding returned');
        }
      }
      logger.info({ progress: `${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}` }, 'Batch embedded');
    } catch (err: any) {
      logger.error({ err: err.message, progress: `${i}-${i + BATCH_SIZE}` }, 'Batch failed, retrying individually...');
      for (const row of batch) {
        try {
          await sleep(500);
          const emb = await embedder.embed((row.content as string).slice(0, 2000));
          if (!emb.every((v) => v === 0)) {
            await pool.query('UPDATE document_chunks SET embedding = $1 WHERE id = $2', [JSON.stringify(emb), row.id]);
          }
        } catch (e2: any) {
          logger.error({ err: e2.message, chunkId: row.id }, 'Single embed failed');
        }
      }
    }
    await sleep(200);
  }

  const { rows: remaining } = await pool.query('SELECT COUNT(*) as c FROM document_chunks WHERE embedding IS NULL');
  logger.info({ remaining: remaining[0].c }, 'Done');
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
