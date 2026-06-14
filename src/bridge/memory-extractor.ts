/**
 * Memory Extractor — v2.5 RAG §3.2
 * LLM-based structured memory extraction from sliding window text.
 * Output: CandidateMemory[] with type + subject + polarity + confidence + source_quote
 */

import type { Logger } from '../utils/logger.js';
import { SubjectNormalizer } from './subject-normalizer.js';
import { pool } from '../db/index.js';
import { decrypt } from '../db/crypto.js';

export interface CandidateMemory {
  type: 'fact' | 'event' | 'preference' | 'entity' | 'decision';
  subject: string;
  subject_normalized: string;
  content: string;  // JSON-stringified type-specific payload
  source_quote: string;
  confidence: number;
  polarity: 'affirm' | 'negate';
  mentions?: number[];
}

export class MemoryExtractor {
  private logger: Logger;
  private normalizer: SubjectNormalizer;
  private callCount = new Map<string, number>();
  private readonly DAILY_LIMIT = 50;
  private processedWindows = new Set<string>(); // dedup key set

  // Provider config loaded from provider_configs (default LLM), mirroring AutoTagger.
  private apiKey = '';
  private baseUrl = '';
  private model = 'claude-haiku-4-5-20251001';
  private isAnthropic = true;
  private initPromise: Promise<void> | null = null;

  constructor(logger: Logger, normalizer: SubjectNormalizer) {
    this.logger = logger;
    this.normalizer = normalizer;
  }

  private async ensureInit(): Promise<void> {
    if (this.apiKey) return;
    if (!this.initPromise) {
      this.initPromise = this.loadProvider();
    }
    await this.initPromise;
  }

  private async loadProvider(): Promise<void> {
    try {
      // Accept any provider whose type indicates an LLM (LLM / openai / anthropic).
      // panmira web UI does not enforce a type enum, so users may pick "openai" for
      // an openai-compatible base_url. We treat all such rows as LLM candidates and
      // pick the default one (or first by name) as the active provider.
      const { rows } = await pool.query(
        "SELECT api_key_encrypted, base_url, model FROM provider_configs WHERE type IN ('LLM', 'openai', 'anthropic') ORDER BY is_default DESC, name LIMIT 1",
      );
      if (rows[0]?.api_key_encrypted) {
        this.apiKey = decrypt(rows[0].api_key_encrypted);
        this.baseUrl = (rows[0].base_url || '').replace(/\/+$/, '');
        this.model = rows[0].model || 'claude-haiku-4-5-20251001';
        this.isAnthropic = /\/anthropic/i.test(this.baseUrl);
        this.logger.info(
          { baseUrl: this.baseUrl, model: this.model, isAnthropic: this.isAnthropic },
          'MemoryExtractor: loaded LLM provider',
        );
        return;
      }
      this.logger.warn('MemoryExtractor: no LLM provider configured');
    } catch (err: any) {
      this.logger.error({ err: err.message }, 'MemoryExtractor: failed to load provider');
    }
  }

  /**
   * Extract structured memories from window text.
   * Returns empty array on failure / rate limit / dedup.
   */
  async extract(
    windowText: string,
    agentId: string,
    sessionId: string,
    windowIdx: number,
  ): Promise<CandidateMemory[]> {
    const dedupKey = `${agentId}:${sessionId}:${windowIdx}`;
    if (this.processedWindows.has(dedupKey)) return [];
    this.processedWindows.add(dedupKey);

    const today = new Date().toISOString().slice(0, 10);
    const dailyKey = `${agentId}:${today}`;
    const used = this.callCount.get(dailyKey) || 0;
    if (used >= this.DAILY_LIMIT) {
      this.logger.warn({ agentId, used }, 'MemoryExtractor daily limit hit');
      return [];
    }

    await this.ensureInit();
    if (!this.apiKey) {
      this.logger.warn('No LLM provider configured, skipping LLM extraction');
      return [];
    }

    const prompt = `你从对话记录中提取结构化的记忆.

输入:
${windowText.slice(0, 4000)}

输出规则:
1. 只对"有持久价值的信息"提取 — 用户的偏好、决策、事实、事件、实体
2. 每种类型最多 1 条
3. 如果没有值得记忆的内容, 输出空数组 []
4. 严格 JSON 数组, 不解释

每条记忆的 JSON 格式:
{
  "type": "fact|event|preference|entity|decision",
  "subject": "点分层的主题键, 如 user.prefer.tech_stack",
  "content_payload": {},
  "source_quote": "原文引用 1-2 句",
  "confidence": 0.8,
  "polarity": "affirm|negate"
}

content_payload 按类型:
- fact: {"statement":"...", "polarity":"affirm"}
- event: {"name":"...", "occurred_at":"ISO日期", "actors":["角色1"], "outcome":"结果"}
- preference: {"key":"偏好名", "value":"偏好值", "confidence":0.8}
- entity: {"name":"实体名", "kind":"person|project|tool|org", "aliases":["别名1"]}
- decision: {"question":"决策问题", "choice":"选择", "rationale":"理由"}

只输出 JSON 数组, 不要其他文字.`;

    try {
      let text = '';
      if (this.isAnthropic) {
        const resp = await fetch(`${this.baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 4000,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!resp.ok) {
          this.logger.warn({ status: resp.status, agentId, baseUrl: this.baseUrl }, 'MemoryExtractor API error');
          return [];
        }
        const data = await resp.json() as any;
        // Anthropic /v1/messages may return multiple content blocks (text,
        // thinking, tool_use, ...). We want the text block specifically —
        // e.g. MiniMax models emit a {"type":"thinking"} block first.
        const textBlock = (data.content || []).find((b: any) => b.type === 'text');
        text = textBlock?.text || '';
      } else {
        // OpenAI-compatible ChatCompletion
        const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 4000,
            temperature: 0,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!resp.ok) {
          this.logger.warn({ status: resp.status, agentId, baseUrl: this.baseUrl }, 'MemoryExtractor API error');
          return [];
        }
        const data = await resp.json() as any;
        text = data.choices?.[0]?.message?.content || '';
      }

      // Strip markdown code fences (```json ... ```) that some LLMs add around JSON
      const fenced = text.replace(/^\s*```[a-zA-Z]*\s*\n?/, '').replace(/\n?\s*```\s*$/, '');
      const jsonMatch = fenced.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.debug({ text: text.slice(0, 200), agentId }, 'No JSON array in LLM response');
        return [];
      }

      let candidates: any[];
      try {
        candidates = JSON.parse(jsonMatch[0]) as any[];
      } catch (err: any) {
        // Truncated/malformed JSON — recover by trimming to last complete object
        const raw = jsonMatch[0];
        const lastClose = raw.lastIndexOf('}');
        if (lastClose > 0) {
          const recovered = raw.slice(0, lastClose + 1) + ']';
          try {
            candidates = JSON.parse(recovered) as any[];
            this.logger.warn({ agentId, originalLen: raw.length, recovered: candidates.length }, 'MemoryExtractor: recovered partial JSON after truncation');
          } catch {
            this.logger.warn({ err: err?.message, agentId, head: raw.slice(0, 200), tail: raw.slice(-200) }, 'MemoryExtractor: JSON parse failed (unrecoverable)');
            return [];
          }
        } else {
          this.logger.warn({ err: err?.message, agentId, head: raw.slice(0, 200) }, 'MemoryExtractor: JSON parse failed (no closing brace)');
          return [];
        }
      }
      this.callCount.set(dailyKey, used + 1);

      // Normalize each candidate (subject via SubjectNormalizer)
      const result: CandidateMemory[] = [];
      for (const c of candidates) {
        if (!c.type || !c.subject) continue;
        if (!['fact', 'event', 'preference', 'entity', 'decision'].includes(c.type)) continue;
        const norm = await this.normalizer.normalize(c.subject, agentId);
        result.push({
          type: c.type,
          subject: c.subject,
          subject_normalized: norm.canonical,
          content: JSON.stringify(c.content_payload || {}),
          source_quote: String(c.source_quote || '').slice(0, 300),
          confidence: Math.min(1, Math.max(0, Number(c.confidence) || 0.5)),
          polarity: c.polarity === 'negate' ? 'negate' : 'affirm',
        });
      }

      this.logger.info(
        { agentId, windowIdx, candidates: candidates.length, extracted: result.length, dailyUsed: used + 1 },
        'MemoryExtractor: structured memories extracted',
      );
      return result;
    } catch (err: any) {
      this.logger.warn({ err: err?.message, agentId }, 'MemoryExtractor LLM call failed');
      return [];
    }
  }


  // v22.1: rule-based chunking
  private chunkText(text: string): string[] {
    const blocks = text.split(/\n\s*\n/).filter((b: string) => b.trim().length > 30);
    if (blocks.length === 0) return [text.slice(0, 4000)];
    const chunks: string[] = []; let buf = '';
    for (const b of blocks) {
      if (buf.length + b.length < 500) { buf += (buf ? '\n\n' : '') + b; }
      else { if (buf) chunks.push(buf.slice(0, 3000)); buf = b; }
    }
    if (buf) chunks.push(buf.slice(0, 3000));
    return chunks.length > 0 ? chunks : [text.slice(0, 4000)];
  }

  clearCache(): void {
    this.processedWindows.clear();
    this.callCount.clear();
  }
}
