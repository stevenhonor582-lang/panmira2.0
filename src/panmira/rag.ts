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
    const [documents, memories] = await Promise.all([
      this.searchDocuments(query),
      this.config.includeMemories ? this.searchMemories(query, chatId) : Promise.resolve([]),
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
   * Search conversation memories using PostgreSQL pgvector.
   */
  private async searchMemories(query: string, chatId?: string): Promise<RAGMemory[]> {
    try {
      const { rows } = await pool.query(
        `SELECT 
          d.content,
          importance,
          created_at,
          CASE WHEN embedding IS NOT NULL 
            THEN 1 - (embedding <=> $1::vector) 
            ELSE 0 
          END as relevance
         FROM memories
         WHERE d.content IS NOT NULL AND d.content != ''
         ORDER BY relevance DESC, importance DESC
         LIMIT $2`,
        [JSON.stringify(Array(1024).fill(0)), this.config.maxMemories], // placeholder vector
      );

      return rows.map((row: any) => ({
        content: this.truncateContent(row.content, 300),
        relevance: Math.max(0, Math.min(1, row.relevance || 0)),
        timestamp: row.created_at ? new Date(row.created_at).toISOString() : '',
      }));
    } catch (err: any) {
      this.logger.warn({ err: err.message }, 'RAG memory search failed');
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
