/**
 * Backfill script: chunk all existing documents that have no chunks yet.
 * Usage: npx tsx src/memory/backfill-chunks.ts
 */
import { pool } from '../db/index.js';
import { DocEmbedder } from './doc-embedder.js';
import { AutoTagger } from './auto-tagger.js';
import { chunkDocument } from './document-chunker.js';
import pino from 'pino';

const CONCURRENCY = 3;
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
  },
});

async function main() {
  const embedder = new DocEmbedder(logger);
  const autoTagger = new AutoTagger(logger);

  logger.info('Fetching documents without chunks...');
  const { rows: docs } = await pool.query(`
    SELECT d.id, d.title, d.content
    FROM documents d
    WHERE NOT EXISTS (SELECT 1 FROM document_chunks dc WHERE dc.document_id = d.id)
    ORDER BY d.created_at
  `);

  if (docs.length === 0) {
    logger.info('No documents to backfill');
    return;
  }

  logger.info({ count: docs.length }, 'Documents to backfill');

  for (let i = 0; i < docs.length; i += CONCURRENCY) {
    const batch = docs.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (doc: { id: string; title: string; content: string }) => {
        try {
          const content = doc.content || '';
          if (content.length === 0) return;

          // Auto-tag if no tags
          const { rows: tagRows } = await pool.query('SELECT tags FROM documents WHERE id = $1', [doc.id]);
          const rawTags = tagRows[0]?.tags || '[]';
          let existingTags: string[] = [];
          try {
            existingTags = JSON.parse(rawTags);
          } catch {
            existingTags = [];
          }
          if (existingTags.length === 0) {
            const tags = await autoTagger.extractTags(doc.title, content);
            if (tags.length > 0) {
              await pool.query('UPDATE documents SET tags = $1 WHERE id = $2', [JSON.stringify(tags), doc.id]);
              logger.info({ docId: doc.id, tags }, 'Auto-tagged');
            }
          }

          // Chunk and embed
          const chunks = chunkDocument(doc.title, content);
          const now = new Date().toISOString();

          for (const chunk of chunks) {
            const chunkId = crypto.randomUUID();
            await pool.query(
              'INSERT INTO document_chunks (id, document_id, chunk_index, content, heading, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
              [chunkId, doc.id, chunk.index, chunk.content, chunk.heading || null, now],
            );

            const embedding = await embedder.embed(chunk.content);
            if (!embedding.every((v) => v === 0)) {
              await pool.query('UPDATE document_chunks SET embedding = $1 WHERE id = $2', [
                JSON.stringify(embedding),
                chunkId,
              ]);
            }
          }

          logger.info(
            { docId: doc.id, chunkCount: chunks.length, progress: `${i + batch.indexOf(doc) + 1}/${docs.length}` },
            'Chunked',
          );
        } catch (err: any) {
          logger.error({ err: err.message, docId: doc.id }, 'Failed to backfill document');
        }
      }),
    );
  }

  logger.info('Backfill complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
