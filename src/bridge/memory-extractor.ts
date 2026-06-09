/**
 * Memory Extractor — v2.5 RAG §3.2
 * LLM-based structured memory extraction from sliding window text.
 * Output: CandidateMemory[] with type + subject + polarity + confidence + source_quote
 */

import type { Logger } from '../utils/logger.js';
import { SubjectNormalizer } from './subject-normalizer.js';

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

  constructor(logger: Logger, normalizer: SubjectNormalizer) {
    this.logger = logger;
    this.normalizer = normalizer;
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

    const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    const apiKey = process.env.ANTHROPIC_AUTH_TOKEN;
    if (!apiKey) {
      this.logger.warn('ANTHROPIC_AUTH_TOKEN not set, skipping LLM extraction');
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
      const resp = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!resp.ok) {
        this.logger.warn({ status: resp.status, agentId }, 'MemoryExtractor API error');
        return [];
      }

      const data = await resp.json() as any;
      const text = data.content?.[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.debug({ text: text.slice(0, 200), agentId }, 'No JSON array in LLM response');
        return [];
      }

      const candidates = JSON.parse(jsonMatch[0]) as any[];
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
