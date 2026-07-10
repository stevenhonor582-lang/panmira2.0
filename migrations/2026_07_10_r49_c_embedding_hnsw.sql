-- R49-C · 加 HNSW 向量索引(memories + document_chunks)
--
-- 决策依据(2026-07-10 EXPLAIN ANALYZE):
--   memories.embedding 当前 0 个 HNSW 索引
--   实际查询模式(memory-storage.ts / knowledge-fetcher.ts / hybrid-search.ts)
--     全部走 <=> (cosine distance) ORDER BY
--   现状: Seq Scan on 3483 行, 24ms execution
--   加索引后预期: Index Scan 估 < 2ms (15x+ 提升)
--
-- 行数确认(2026-07-10):
--   memories:         4207 总行 / 4173 有 embedding (99.2%)
--   document_chunks:  20 总行 / 20 有 embedding (100%)
--
-- 参数选择: m=16, ef_construction=64(与 R48 semantic_assets 一致)
BEGIN;

-- memories.embedding HNSW(cosine)
CREATE INDEX IF NOT EXISTS idx_memories_embedding_hnsw
  ON public.memories
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- document_chunks.embedding HNSW(cosine)(小表, 构建快, 行为一致)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

COMMIT;
