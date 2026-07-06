/**
 * Plan B-2 混合检索服务
 * - 向量检索: pgvector cosine similarity (top-N)
 * - 全文检索: tsvector BM25 via ts_rank_cd (top-N)
 * - 融合: RRF (Reciprocal Rank Fusion, k=60)
 * - 权限: visibility 过滤 (personal/team/company)
 */
import { pool } from '../db/index.js';
import { knowledgeBases } from '../db/schema.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { embedText } from './embedder.js';

export type SearchMode = 'vector' | 'bm25' | 'hybrid';

export interface SearchOptions {
  query: string;
  kbIds: string[];
  topK?: number;          // 默认 5
  mode?: SearchMode;      // 默认 hybrid
  vectorLimit?: number;   // 默认 20
  bm25Limit?: number;     // 默认 20
  visibilityFilter?: { userId: string; teamId?: string; tenantId: string };
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  content: string;
  score: number;
  vectorRank?: number;
  bm25Rank?: number;
}

const DEFAULT_TOPK = 5;
const DEFAULT_VECTOR_LIMIT = 20;
const DEFAULT_BM25_LIMIT = 20;
const RRF_K = 60;

/**
 * 纯函数: RRF 融合
 * 给定两个 ranked 列表,返回按 RRF 分数合并后的 topN
 */
export function rrfFuse(
  vectorResults: SearchResult[],
  bm25Results: SearchResult[],
  topN: number,
  k: number = RRF_K,
): SearchResult[] {
  const scoreMap = new Map<string, SearchResult>();

  vectorResults.forEach((r, i) => {
    const existing = scoreMap.get(r.chunkId);
    const rrfScore = 1 / (k + (i + 1));
    if (existing) {
      existing.score = existing.score + rrfScore;
      existing.vectorRank = i + 1;
    } else {
      scoreMap.set(r.chunkId, { ...r, score: rrfScore, vectorRank: i + 1 });
    }
  });

  bm25Results.forEach((r, i) => {
    const existing = scoreMap.get(r.chunkId);
    const rrfScore = 1 / (k + (i + 1));
    if (existing) {
      existing.score = existing.score + rrfScore;
      existing.bm25Rank = i + 1;
    } else {
      scoreMap.set(r.chunkId, { ...r, score: rrfScore, bm25Rank: i + 1 });
    }
  });

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

/** 构造 visibility 过滤 SQL 条件 */
function buildVisibilityWhere(
  kbIds: string[],
  filter?: { userId: string; teamId?: string; tenantId: string },
): { sql: string; params: any[] } {
  const params: any[] = [];
  let where = `d.kb_id = ANY($${params.push(kbIds)}::uuid[])`;

  if (filter) {
    // 文档级 visibility: company(所有人) / team(同 team) / private(owner)
    // 1. company 公开
    where += ` AND (
      d.visibility = 'company'
      ${filter.teamId ? `OR (d.visibility = 'team' AND (d.kb_id IN (SELECT id FROM knowledge_bases WHERE team_id = $${params.push(filter.teamId)}::uuid) OR d.kb_id IN (SELECT id FROM knowledge_bases WHERE team_id IS NULL)))` : ''}
      ${filter.userId ? `OR (d.visibility = 'private' AND d.owner_user_id = $${params.push(filter.userId)}::uuid)` : ''}
    )`;
    // tenant 隔离
    where += ` AND d.kb_id IN (SELECT id FROM knowledge_bases WHERE tenant_id = $${params.push(filter.tenantId)}::uuid)`;
  }

  return { sql: where, params };
}

/** pgvector cosine top-N */
export async function vectorSearch(
  query: string,
  kbIds: string[],
  limit: number,
  filter?: { userId: string; teamId?: string; tenantId: string },
): Promise<SearchResult[]> {
  if (kbIds.length === 0) return [];
  if (!query.trim()) return [];

  // 1. 拿 query embedding - 找第一个 KB 的 provider
  const firstKbId = kbIds[0]!;
  const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, firstKbId)).limit(1);
  if (!kb?.embeddingProviderId) {
    // 无 embedding provider,降级返回空
    return [];
  }
  const queryVec = await embedText({ providerId: kb.embeddingProviderId, text: query });
  if (!queryVec) return [];

  // 2. 格式化向量为 pgvector 字面量: '[1,2,3]'
  const vecStr = `[${queryVec.join(',')}]`;

  // 3. 跑 SQL
  const v = buildVisibilityWhere(kbIds, filter);
  const sql = `
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      1 - (c.embedding <=> $${v.params.length + 1}::vector) AS score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE ${v.sql}
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> $${v.params.length + 1}::vector
    LIMIT $${v.params.length + 2}
  `;
  const allParams = [...v.params, vecStr, limit];
  const result = await pool.query(sql, allParams);
  return result.rows.map((r: any) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    content: r.content,
    score: Number(r.score),
  }));
}

/** BM25 top-N */
export async function bm25Search(
  query: string,
  kbIds: string[],
  limit: number,
  filter?: { userId: string; teamId?: string; tenantId: string },
): Promise<SearchResult[]> {
  if (kbIds.length === 0) return [];
  if (!query.trim()) return [];

  const v = buildVisibilityWhere(kbIds, filter);
  const sql = `
    SELECT
      c.id AS chunk_id,
      c.document_id,
      c.content,
      ts_rank_cd(c.search_tsv, plainto_tsquery('simple', $${v.params.length + 1})) AS score
    FROM document_chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE ${v.sql}
      AND c.search_tsv @@ plainto_tsquery('simple', $${v.params.length + 1})
    ORDER BY score DESC
    LIMIT $${v.params.length + 2}
  `;
  const allParams = [...v.params, query, limit];
  const result = await pool.query(sql, allParams);
  return result.rows.map((r: any) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    content: r.content,
    score: Number(r.score),
  }));
}

/** 主入口: 混合检索 */
export async function hybridSearch(opts: SearchOptions): Promise<SearchResult[]> {
  const mode = opts.mode || 'hybrid';
  const topK = opts.topK || DEFAULT_TOPK;
  const vectorLimit = opts.vectorLimit || DEFAULT_VECTOR_LIMIT;
  const bm25Limit = opts.bm25Limit || DEFAULT_BM25_LIMIT;

  if (mode === 'vector') {
    return vectorSearch(opts.query, opts.kbIds, topK, opts.visibilityFilter);
  }
  if (mode === 'bm25') {
    return bm25Search(opts.query, opts.kbIds, topK, opts.visibilityFilter);
  }

  // hybrid
  const [v, b] = await Promise.all([
    vectorSearch(opts.query, opts.kbIds, vectorLimit, opts.visibilityFilter),
    bm25Search(opts.query, opts.kbIds, bm25Limit, opts.visibilityFilter),
  ]);
  return rrfFuse(v, b, topK);
}
