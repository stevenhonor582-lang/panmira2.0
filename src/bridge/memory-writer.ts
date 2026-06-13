/**
 * MemoryWriter — v1 (RAG §3.3 hard dedup by subject)
 * Hard-dedup by (agent_id, subject_normalized) — bump hit_count on hit.
 */

import type { MemoryClient } from '../memory/memory-client.js';
import type { Logger } from '../utils/logger.js';
import type { WorkspaceManager } from '../memory/workspace-manager.js';
import { DocEmbedder } from '../memory/doc-embedder.js';
import { SubjectNormalizer } from './subject-normalizer.js';
import { MemoryExtractor } from './memory-extractor.js';
import { pool } from '../db/index.js';

const RATE_LIMIT_MS = 10 * 60 * 1000; // legacy 10-min rate limit (kept for backward compat)
const MAX_CACHE_SIZE = 100;
const WINDOW_TOKENS = 500; // v2.4: trigger extraction when buffer >= 2000 tokens
const WINDOW_STEP = 250; // 50% overlap — keep last 1000 tokens after extraction

export class MemoryWriter {
  private folderCache = new Map<string, string>();
  private lastRecordTime = new Map<string, number>();
  private workspaceManager?: WorkspaceManager;
  private normalizer: SubjectNormalizer;
  private extractor: MemoryExtractor;
  // v2.4: sliding window buffer
  private buffer: Map<string, { messages: string; tokens: number; lastWindowIdx: number }> = new Map();


  constructor(
    private memoryClient: MemoryClient,
    private logger: Logger,
    extractor: MemoryExtractor,
    normalizer: SubjectNormalizer,
  ) {
    this.extractor = extractor;
    this.normalizer = normalizer;
  }


  /**
   * v2.4: rough token estimate (~1.5 chars/token for CJK mixed, ~0.25 for English)
   */
  private estimateTokens(s: string): number {
    if (!s) return 0;
    let cjk = 0, ascii = 0;
    for (const c of s) {
      const code = c.charCodeAt(0);
      if (code > 0x4E00) cjk++; else ascii++;
    }
    return Math.ceil(cjk + ascii * 0.25);
  }

  setWorkspaceManager(wm: WorkspaceManager): void {
    this.workspaceManager = wm;
  }

  /**
   * Extract subject key from user message — simple heuristic for v1.
   * Format: <agentId>:<first-30-chars-of-message-snake_cased>
   */
  private async extractSubject(userMessage: string, agentId: string): Promise<{ subject: string; normalized: string; confidence: number }> {
    const clean = userMessage
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/[^\w一-鿿\s]/g, '')
      .trim()
      .slice(0, 30);
    // v2.1: normalize through rules (pinyin/alias/contain) + LLM fallback
    const result = await this.normalizer.normalize(clean, agentId);
    const subject = `${agentId}:${result.canonical}`;
    const normalized = subject.toLowerCase().replace(/\s+/g, '_');
    const confidence = Math.max(result.confidence, userMessage.length > 50 ? 0.7 : 0.5);
    return { subject, normalized, confidence };
  }

  /**
   * v1: hard dedup by (agent_id, subject_normalized).
   * Returns: 'merged' (bumped existing), 'inserted' (new), or 'skipped' (failed).
   */
  private async upsertMemory(
    agentId: string,
    subject: string,
    subjectNormalized: string,
    content: string,
    confidence: number,
    metadata: { chatId: string; userId?: string },
  ): Promise<'merged' | 'inserted' | 'skipped'> {
    try {
      // Check existing
      const { rows } = await pool.query(
        `SELECT id, hit_count, confidence FROM memories
          WHERE agent_id = $1 AND subject_normalized = $2
            AND invalidated_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [agentId, subjectNormalized],
      );
      if (rows.length > 0) {
        const existing = rows[0];
        const newConf = Math.max(existing.confidence, confidence);
        await pool.query(
          `UPDATE memories
              SET content = $1, confidence = $2, hit_count = hit_count + 1,
                  last_hit_at = NOW(), 
            WHERE id = $3`,
          [content, newConf, existing.id],
        );
        this.logger.info(
          { agentId, subjectNormalized, hitCount: existing.hit_count + 1, conf: newConf },
          'Memory merged (hard dedup hit)',
        );
        return 'merged';
      }
      // INSERT new
      let embedding: number[] | null = null;
      try {
        const embedder = new DocEmbedder(this.logger);
        [embedding] = await embedder.embedBatch([content]);
      } catch {}
      await pool.query(
        `INSERT INTO memories (id, content, layer, user_id, agent_id, tenant_id, importance,
          embedding, metadata_json, subject, subject_normalized, confidence, hit_count, type)
         VALUES (gen_random_uuid()::text, $1, 1, $2, $3, 'default', $4,
          $5::vector, $6::jsonb, $7, $8, $9, 0, 'event')`,
        [content, metadata.userId ?? 'anonymous', agentId, confidence,
          embedding ? '[' + embedding.join(',') + ']' : null,
          JSON.stringify({ source: 'conversation-memory', chatId: metadata.chatId }),
          subject, subjectNormalized, confidence],
      );
      this.logger.info({ agentId, subjectNormalized, confidence }, 'New memory inserted (v1)');
      return 'inserted';
    } catch (err: any) {
      this.logger.warn({ err: err?.message, agentId, subjectNormalized }, 'upsertMemory failed');
      return 'skipped';
    }
  }

  async record(
    botName: string,
    userMessage: string,
    assistantResponse: string,
    metadata: { chatId: string; chatType?: string; userId?: string; durationMs?: number; costUsd?: number },
  ): Promise<void> {
    try {
      // Resolve bot_id early for v2.5 LLM extraction
      let agentId: string = botName;
      try {
        const { rows: botRows } = await pool.query(
          'SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1',
          [botName],
        );
        if (botRows.length > 0) agentId = botRows[0].bot_id as string;
      } catch {}

      // v2.4 sliding window: accumulate into per-chat buffer
      // Trigger extraction when buffer token count crosses threshold
      const chatId = metadata.chatId;
      let buf = this.buffer.get(chatId);
      if (!buf) {
        buf = { messages: '', tokens: 0, lastWindowIdx: 0 };
        this.buffer.set(chatId, buf);
      }
      // append this turn
      const turn = `User: ${userMessage}\nAssistant: ${assistantResponse}\n---\n`;
      buf.messages += turn;
      buf.tokens += this.estimateTokens(turn);

      // v2.4: trigger when buffer >= WINDOW_TOKENS
      if (buf.tokens < WINDOW_TOKENS) {
        return; // not yet, keep accumulating
      }
      // v2.5: run LLM extraction on the window snapshot
      let candidates: any[] = [];
      try {
        const agentIdFinal = agentId; // bot_id already resolved
        const windowText = buf.messages;
        candidates = await this.extractor.extract(windowText, agentIdFinal, chatId, buf.lastWindowIdx + 1);
        // Write each candidate as a structured memory
        for (const cand of candidates) {
          try {
            let embedding: number[] | null = null;
            try {
              const embedder = new DocEmbedder(this.logger);
              [embedding] = await embedder.embedBatch([cand.content]);
            } catch {}
            await pool.query(
              `INSERT INTO memories (id, content, layer, user_id, agent_id, tenant_id, importance,
                embedding, metadata_json, subject, subject_normalized, confidence, hit_count, type, polarity)
               VALUES (gen_random_uuid()::text, $1, 1, $2, $3, 'default', $4,
                $5::vector, $6::jsonb, $7, $8, $9, 0, $10, $11)`,
              [cand.content, metadata.userId ?? 'anonymous', agentIdFinal, cand.confidence,
                embedding ? '[' + embedding.join(',') + ']' : null,
                JSON.stringify({ source: 'llm-extraction', source_quote: cand.source_quote, chatId }),
                cand.subject, cand.subject_normalized, cand.confidence, cand.type, cand.polarity],
            );
          } catch (err: any) {
            this.logger.warn({ err: err?.message, agentId }, 'Failed to insert LLM extracted memory');
          }
        }
        if (candidates.length > 0) {
          this.logger.info({ agentId, candidateCount: candidates.length }, 'LLM memories inserted');
        }
      } catch (err: any) {
        this.logger.warn({ err: err?.message, agentId }, 'LLM extraction failed, falling back to raw record');
      }

      // Extract: take snapshot, keep last WINDOW_STEP for overlap
      const snapshot = buf.messages;
      // keep last WINDOW_STEP tokens = ~half
      const halfChars = Math.floor(snapshot.length / 2);
      buf.messages = snapshot.slice(snapshot.length - halfChars);
      buf.tokens = this.estimateTokens(buf.messages);
      const windowIdx = ++buf.lastWindowIdx;
      this.lastRecordTime.set(chatId, Date.now());

      // Use the accumulated turn as the "user message" for record
      // Build title from first user line
      const firstUserMatch = snapshot.match(/User: ([^\n]+)/);
      const title = firstUserMatch ? firstUserMatch[1].slice(0, 60) : this.buildTitle(userMessage);
      const content = this.buildContent(`[window ${windowIdx} ${buf.tokens} tokens]\n\n` + snapshot, '', metadata);
      const tags = ['conversation-memory', botName, chatId, `window-${windowIdx}`];

      // 1) Write document to web-visible folder
      if (this.workspaceManager) {
        if (metadata.chatType === 'group') {
          await this.workspaceManager.createGroupDoc(metadata.chatId, 'knowledge', title, content, tags);
        } else {
          await this.workspaceManager.createBotDoc(botName, 'knowledge', title, content, tags);
        }
      } else {
        const folderId = await this.ensureFolder(`数字员工/${botName}/知识沉淀`);
        if (!folderId) return;
        await this.memoryClient.createDocument({
          title, content, folder_id: folderId, tags, created_by: botName,
        });
      }

      // 2) v1: hard-dedup into memories (RAG §3.3)
      const { subject, normalized, confidence } = await this.extractSubject(userMessage, agentId);
      await this.upsertMemory(agentId, subject, normalized, content, confidence, {
        chatId: metadata.chatId,
        userId: metadata.userId,
      });

      this.logger.debug({ botName, chatId: metadata.chatId, subject: normalized }, 'Memory recorded (v1)');
    } catch (err: any) {
      this.logger.warn({ err: err?.message, botName }, 'Failed to record conversation memory');
    }
  }

  private buildTitle(userMessage: string): string {
    const clean = userMessage.replace(/\n/g, ' ').trim();
    return clean.length > 60 ? clean.slice(0, 57) + '...' : clean;
  }

  private buildContent(
    userMessage: string,
    assistantResponse: string,
    metadata: { chatId: string; userId?: string; durationMs?: number; costUsd?: number },
  ): string {
    const ts = new Date().toISOString();
    const lines = [`# 对话记录 ${ts}`, '', `**用户**: ${userMessage.slice(0, 500)}`, ''];
    if (metadata.userId) lines.push(`**用户ID**: ${metadata.userId}`);
    if (metadata.durationMs) lines.push(`**耗时**: ${(metadata.durationMs / 1000).toFixed(1)}s`);
    if (metadata.costUsd) lines.push(`**费用**: $${metadata.costUsd.toFixed(4)}`);
    lines.push(''); lines.push('**助手回复**:');
    lines.push(assistantResponse.slice(0, 2000));
    return lines.join('\n');
  }


  /**
   * v2.4: flush remaining buffer (call on session end / cleanup)
   */
  async flush(chatId: string, botName: string): Promise<void> {
    const buf = this.buffer.get(chatId);
    if (!buf || buf.messages.length === 0) return;
    this.buffer.delete(chatId);
    // process remaining as a final extraction
    // (skip for now — buffer < 2000 tokens means it was already covered)
  }

  private async ensureFolder(path: string): Promise<string | null> {
    const cached = this.folderCache.get(path);
    if (cached) return cached;
    const parts = path.split('/');
    let parentId = 'root';
    for (const part of parts) {
      const id = await this.memoryClient.ensureFolder(part, parentId);
      if (!id) return null;
      parentId = id;
    }
    if (this.folderCache.size >= MAX_CACHE_SIZE) {
      const oldest = this.folderCache.keys().next().value;
      if (oldest) this.folderCache.delete(oldest);
    }
    this.folderCache.set(path, parentId);
    return parentId;
  }
}
