/**
 * Panmira RAG (Retrieval-Augmented Generation)
 * 
 * Unified memory retrieval pipeline:
 * 1. Searches PostgreSQL for relevant documents (knowledge base)
 * 2. Searches PostgreSQL for relevant memories (conversation history)
 * 3. Formats results as structured context
 * 4. Injects into Claude's system prompt before each response
 */

import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface RAGConfig {
  maxDocuments: number;
  maxMemories: number;
  similarityThreshold: number;
  includeMemories: boolean;
}

const DEFAULT_CONFIG: RAGConfig = {
  maxDocuments: 3,
  maxMemories: 2,
  similarityThreshold: 0.3,
  includeMemories: true,
};

export interface RAGContext {
  documents: RAGDocument[];
  memories: RAGMemory[];
  formattedContext: string;
  sourceCount: number;
}

interface RAGDocument {
  title: string;
  snippet: string;
  relevance: number;
  folder?: string;
}

interface RAGMemory {
  content: string;
  relevance: number;
  timestamp: string;
}

export class PanmiraRAG {
  private config: RAGConfig;

  constructor(
    private logger: Logger,
    config?: Partial<RAGConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Retrieve relevant context for a user query.
   * Called before each Claude execution.
   */
  async retrieve(query: string, chatId?: string, botName?: string): Promise<RAGContext> {
    // P1 (2026-07-04): resolve botName → botId so searchMemories can enforce isolation.
    // searchMemories returns [] when botId is missing — safe default, never leaks across bots.
    let botId: string | undefined;
    if (botName) {
      try {
        const { rows } = await pool.query(
          'SELECT bot_id FROM bot_configs WHERE name = $1 AND is_active = true',
          [botName],
        );
        botId = rows[0]?.bot_id;
        if (!botId) {
          this.logger.warn({ botName }, 'RAG bot_name lookup: no active bot found — memories will be empty');
        }
      } catch (err: any) {
        this.logger.warn({ err: err.message, botName }, 'RAG bot_name lookup failed — memories will be empty');
      }
    } else {
      this.logger.debug({ query }, 'RAG retrieve called without botName — memories will be empty');
    }

    const [documents, memories] = await Promise.all([
      this.searchDocuments(query),
      this.config.includeMemories ? this.searchMemories(query, botId) : Promise.resolve([]),
    ]);

    const formattedContext = this.formatContext(documents, memories, botName);

    return {
      documents,
      memories,
      formattedContext,
      sourceCount: documents.length + memories.length,
    };
  }

  /**
   * Search knowledge base documents using PostgreSQL full-text + vector similarity.
   */
  private async searchDocuments(query: string): Promise<RAGDocument[]> {
    try {
      // Hybrid search: combine pgvector cosine similarity with text search
      const { rows } = await pool.query(
        `SELECT 
          d.title, 
          d.content,
          COALESCE(f.name, '') as folder,
          ts_rank(to_tsvector('simple', COALESCE(d.content, '')), plainto_tsquery('simple', $1)) as text_rank
         FROM documents d LEFT JOIN folders f ON d.folder_id = f.id 
         WHERE d.content IS NOT NULL AND d.content != ''
           AND to_tsvector('simple', COALESCE(d.content, '')) @@ plainto_tsquery('simple', $1)
         ORDER BY text_rank DESC
         LIMIT $2`,
        [query.slice(0, 500), this.config.maxDocuments],
      );

      return rows.map((row: any) => ({
        title: row.title || 'Untitled',
        snippet: this.truncateContent(row.content, 500),
        relevance: Math.min(row.text_rank || 0, 1),
        folder: row.folder || undefined,
      }));
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'RAG document search failed');
      return [];
    }
  }

  /**
   * Search conversation memories scoped to a single bot.
   *
   * P1 (2026-07-04): rewrote — original used a zero-vector placeholder for pgvector
   * (always scored 0) AND referenced a non-existent `d.content` alias (always threw,
   * catch returned []). Keyword ILIKE only for now; re-enable pgvector via the
   * memory-engine retriever path which has a real embedder.
   *
   * botId is REQUIRED — returns [] if missing (safe default, never leaks).
   * Filters mirror memory-engine/storage/postgres-store.ts retrieve:
   *   invalidated_at IS NULL, confidence >= 0.5.
   * Sort: hit_count (popularity) > importance > recency.
   */
  private async searchMemories(query: string, botId?: string): Promise<RAGMemory[]> {
    if (!botId) {
      this.logger.warn({ query }, 'RAG searchMemories called without botId — returning []');
      return [];
    }
    try {
      const keyword = `%${query.slice(0, 100)}%`;
      const { rows } = await pool.query(
        `SELECT content, importance, created_at, hit_count
         FROM memories
         WHERE bot_id = $1
           AND invalidated_at IS NULL
           AND confidence >= 0.5
           AND content IS NOT NULL AND content != ''
           AND content ILIKE $2
         ORDER BY hit_count DESC NULLS LAST, importance DESC, created_at DESC
         LIMIT $3`,
        [botId, keyword, this.config.maxMemories],
      );

      return rows.map((row: any) => ({
        content: this.truncateContent(row.content, 300),
        relevance: Math.min((row.hit_count || 0) / 10, 1),
        timestamp: row.created_at ? new Date(row.created_at).toISOString() : '',
      }));
    } catch (err: any) {
      this.logger.warn({ err: err.message, botId }, 'RAG memory search failed');
      return [];
    }
  }

  /**
   * Format retrieved context for injection into system prompt.
   */
  private formatContext(docs: RAGDocument[], mems: RAGMemory[], botName?: string): string {
    if (docs.length === 0 && mems.length === 0) return '';

    const parts: string[] = [];
    parts.push('\n## 📚 相关知识库内容（自动检索）\n');

    if (docs.length > 0) {
      parts.push('### 知识文档');
      for (const doc of docs) {
        const folderTag = doc.folder ? ` [${doc.folder}]` : '';
        parts.push(`- **${doc.title}**${folderTag}\n  ${doc.snippet}`);
      }
    }

    if (mems.length > 0) {
      parts.push('\n### 历史记忆');
      for (const mem of mems) {
        parts.push(`- ${mem.content}`);
      }
    }

    parts.push(`\n> 💡 以上内容来自 Panmira 知识库，请优先参考这些信息回答。\n`);

    return parts.join('\n');
  }

  /**
   * Truncate content to maxLength, preserving whole sentences where possible.
   */
  private truncateContent(content: string, maxLength: number): string {
    if (!content || content.length <= maxLength) return content || '';
    const truncated = content.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('。');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline, maxLength - 50);
    return truncated.slice(0, cutPoint) + '...';
  }

  /**
   * Check if the knowledge base has any content for a given topic.
   * Returns true if relevant documents exist.
   */
  async hasKnowledge(query: string): Promise<boolean> {
    try {
      const { rows } = await pool.query(
        `SELECT 1 FROM documents d LEFT JOIN folders f ON d.folder_id = f.id 
         WHERE d.content IS NOT NULL AND d.content != ''
           AND (title ILIKE $1 OR content ILIKE $1)
         LIMIT 1`,
        [`%${query.slice(0, 100)}%`],
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }
}
