-- Plan B-2: tsvector 列 + GIN 索引(BM25 全文检索用)
-- 注意: auto-migrate 不支持 generated column, 需手 ALTER

ALTER TABLE document_chunks
  ADD COLUMN IF NOT EXISTS search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content,''))) STORED;

CREATE INDEX IF NOT EXISTS idx_chunks_tsv
  ON document_chunks USING GIN(search_tsv);
