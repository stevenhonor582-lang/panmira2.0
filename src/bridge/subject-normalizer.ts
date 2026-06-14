/**
 * Subject Normalizer — v2.1 (RAG §3.2)
 * 
 * Stage 1: 规则词典 (alias-dict.json) — pinyin/alias/contain
 * Stage 2: LLM 二次归一 (Anthropic-compatible API, JSON output)
 * 
 * Cost control:
 *  - 每天每 session 100 次
 *  - 24h cache (同 candidate → 已确认 canonical)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../utils/logger.js';
import { pool } from '../db/index.js';
import { decrypt } from '../db/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..', '..');
const DICT_PATH = join(__dirname, 'config', 'alias-dict.json');

interface AliasDict {
  version: string;
  rules: {
    pinyin_map: Record<string, string>;
    alias_map: Record<string, string>;
    contain_strip: Record<string, string[]>;
  };
}

let cachedDict: AliasDict | null = null;
function loadDict(): AliasDict {
  if (cachedDict) return cachedDict;
  cachedDict = JSON.parse(readFileSync(DICT_PATH, 'utf-8'));
  return cachedDict!;
}

export interface NormalizationResult {
  canonical: string;
  matched: 'pinyin' | 'alias' | 'contain' | 'llm' | 'passthrough';
  confidence: number;
  raw_input: string;
}

interface CacheEntry {
  canonical: string;
  matched: 'llm' | 'passthrough';
  expires_at: number;
}

export class SubjectNormalizer {
  private logger: Logger;
  private llmCallCount = new Map<string, number>();
  private readonly LLM_DAILY_LIMIT = 100;
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  // Provider config loaded from provider_configs (default LLM), mirroring MemoryExtractor.
  private apiKey = '';
  private baseUrl = '';
  private model = 'claude-haiku-4-5-20251001';
  private isAnthropic = true;
  private initPromise: Promise<void> | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
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
          'SubjectNormalizer: loaded LLM provider',
        );
        return;
      }
      this.logger.warn('SubjectNormalizer: no LLM provider configured');
    } catch (err: any) {
      this.logger.error({ err: err.message }, 'SubjectNormalizer: failed to load provider');
    }
  }

  /**
   * Stage 1: rule-based (no LLM, <1ms).
   */
  private normalizeByRules(candidate: string): NormalizationResult | null {
    const dict = loadDict();
    const lc = candidate.toLowerCase().trim();
    if (!lc) return null;

    if (dict.rules.pinyin_map[lc]) {
      return { canonical: dict.rules.pinyin_map[lc], matched: 'pinyin', confidence: 0.9, raw_input: candidate };
    }
    for (const [alias, canonical] of Object.entries(dict.rules.alias_map)) {
      if (alias.toLowerCase() === lc) {
        return { canonical, matched: 'alias', confidence: 0.95, raw_input: candidate };
      }
    }
    for (const [key, variants] of Object.entries(dict.rules.contain_strip)) {
      for (const v of variants) {
        if (candidate.includes(v)) {
          return { canonical: key, matched: 'contain', confidence: 0.85, raw_input: candidate };
        }
      }
      if (candidate.includes(key) && candidate !== key) {
        return { canonical: key, matched: 'contain', confidence: 0.85, raw_input: candidate };
      }
    }
    return null;
  }

  /**
   * Stage 2: real LLM call (Anthropic-compatible).
   * Cheap (Haiku model), strict JSON output.
   */
  private async normalizeByLLM(
    candidate: string,
    sessionId: string,
  ): Promise<NormalizationResult | null> {
    const today = new Date().toISOString().slice(0, 10);
    const key = `${sessionId}:${today}`;
    const used = this.llmCallCount.get(key) || 0;
    if (used >= this.LLM_DAILY_LIMIT) {
      this.logger.warn({ sessionId, used }, 'LLM normalization daily limit hit');
      return null;
    }

    // Cache hit
    const cacheKey = `${sessionId}:${candidate}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires_at > Date.now()) {
      this.logger.debug({ candidate, canonical: cached.canonical }, 'Cache hit');
      return {
        canonical: cached.canonical,
        matched: cached.matched,
        confidence: 0.8,
        raw_input: candidate,
      };
    }

    // Get top existing subjects
    let existingList = '';
    try {
      const { rows } = await pool.query(
        `SELECT subject_normalized, hit_count
           FROM memories
          WHERE invalidated_at IS NULL
            AND subject_normalized IS NOT NULL
          ORDER BY hit_count DESC LIMIT 20`,
      );
      existingList = rows.map((r: any) => r.subject_normalized).join('\n');
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'Failed to load existing subjects');
    }

    const prompt = `你是实体归一化助手。

候选实体: "${candidate}"

已知实体列表 (按重要度降序):
${existingList || '(空)'}

判定规则:
1. 候选是不是某个已知实体的: 同义词 / 拼写变体 / 拼音 / 拼写错误 / 缩写?
2. 如果是, 返回那个已知实体的规范名
3. 如果不是, 返回候选原文 (标记为新增)
4. 不要把无关实体错误合并 (如 "海联智达" ≠ "panmira")

严格 JSON 输出, 不要解释:
{"canonical": "规范名", "is_existing": true/false, "confidence": 0-1}`;

    try {
      await this.ensureInit();
      if (!this.apiKey) {
        this.logger.warn('No LLM provider configured, skipping LLM normalize');
        return null;
      }

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
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!resp.ok) {
          this.logger.warn({ status: resp.status, candidate, baseUrl: this.baseUrl }, 'LLM normalize API error');
          return null;
        }
        const data = await resp.json() as any;
        text = data.content?.[0]?.text || '';
      } else {
        const resp = await fetch(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          }),
        });
        if (!resp.ok) {
          this.logger.warn({ status: resp.status, candidate, baseUrl: this.baseUrl }, 'LLM normalize API error');
          return null;
        }
        const data = await resp.json() as any;
        text = data.choices?.[0]?.message?.content || '';
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn({ text, candidate }, 'LLM response no JSON');
        return null;
      }
      const parsed = JSON.parse(jsonMatch[0]);
      const canonical = String(parsed.canonical || '').trim();
      const isExisting = !!parsed.is_existing;
      const conf = Number(parsed.confidence) || 0.5;

      if (!canonical) return null;

      this.llmCallCount.set(key, used + 1);
      this.cache.set(cacheKey, {
        canonical,
        matched: isExisting ? 'llm' : 'passthrough',
        expires_at: Date.now() + this.CACHE_TTL_MS,
      });
      this.logger.info(
        { candidate, canonical, isExisting, conf, dailyUsed: used + 1 },
        'Subject LLM-normalized',
      );
      return { canonical, matched: isExisting ? 'llm' : 'passthrough', confidence: conf, raw_input: candidate };
    } catch (err: any) {
      this.logger.warn({ err: err?.message, candidate }, 'LLM normalize failed');
      return null;
    }
  }

  async normalize(candidate: string, sessionId: string = 'system'): Promise<NormalizationResult> {
    if (!candidate || !candidate.trim()) {
      return { canonical: '', matched: 'passthrough', confidence: 0, raw_input: candidate };
    }
    const ruleResult = this.normalizeByRules(candidate);
    if (ruleResult) return ruleResult;
    const llmResult = await this.normalizeByLLM(candidate, sessionId);
    if (llmResult) return llmResult;
    return { canonical: candidate, matched: 'passthrough', confidence: 0.3, raw_input: candidate };
  }

  clearCache(): void {
    this.cache.clear();
    this.llmCallCount.clear();
  }

  getStats(): { cacheSize: number; dailyCalls: Record<string, number> } {
    const dailyCalls: Record<string, number> = {};
    for (const [k, v] of this.llmCallCount) dailyCalls[k] = v;
    return { cacheSize: this.cache.size, dailyCalls };
  }
}
