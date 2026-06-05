/**
 * Smart Skill Matcher — semantic embedding + keyword hybrid matching.
 * Ranks skills by relevance to user message, replaces pure substring matching.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SKILL_REGISTRY, type SkillMeta } from './skill-registry.js';
import type { Logger } from '../utils/logger.js';

const CACHE_PATH = new URL('../../.cache/skill-embeddings.json', import.meta.url).pathname;

interface ScoredSkill {
  skill: SkillMeta;
  score: number;
  source: 'embedding' | 'keyword' | 'alwaysLoad';
}

export class SmartSkillMatcher {
  private embeddings: Map<string, number[]> = new Map();
  private embedReady = false;
  private embedder: any = null;
  private cacheDirty = false;

  constructor(
    private logger: Logger,
    private platform: string = 'all',
  ) {}

  private async ensureEmbeddings(): Promise<void> {
    if (this.embedReady) return;

    // Try loading from disk cache first
    this.loadDiskCache();

    try {
      const { DocEmbedder } = await import('../memory/doc-embedder.js');
      this.embedder = new DocEmbedder(this.logger);
      this.embedReady = true;
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'SmartSkillMatcher: embedding unavailable, using keyword-only');
      this.embedReady = true;
    }
  }

  // --- Disk cache ---

  private loadDiskCache(): void {
    try {
      if (!existsSync(CACHE_PATH)) return;
      const raw = readFileSync(CACHE_PATH, 'utf-8');
      const obj = JSON.parse(raw) as Record<string, number[]>;
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v) && v.length > 0) {
          this.embeddings.set(k, v);
        }
      }
      if (this.embeddings.size > 0) {
        this.logger.info({ count: this.embeddings.size }, 'SmartSkillMatcher: loaded embeddings from disk cache');
      }
    } catch {
      // Corrupted cache — ignore and recompute
    }
  }

  private saveDiskCache(): void {
    try {
      const dir = dirname(CACHE_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const obj: Record<string, number[]> = {};
      for (const [k, v] of this.embeddings) {
        obj[k] = v;
      }
      writeFileSync(CACHE_PATH, JSON.stringify(obj));
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'SmartSkillMatcher: failed to write disk cache');
    }
  }

  // --- Matching ---

  async match(
    userMessage: string,
    botName?: string,
    maxResults: number = 10,
  ): Promise<SkillMeta[]> {
    await this.ensureEmbeddings();

    const platformSkills = SKILL_REGISTRY.filter(
      (s) => s.platform === 'all' || s.platform === this.platform,
    );

    const available = botName
      ? platformSkills.filter(
          (s) => !s.scope || s.scope === 'global' || s.ownerBot === botName,
        )
      : platformSkills.filter((s) => !s.scope || s.scope === 'global');

    const alwaysLoad = available.filter((s) => s.alwaysLoad);
    const candidates = available.filter((s) => !s.alwaysLoad && s.triggers.length > 0);

    if (candidates.length === 0) return alwaysLoad;

    const scored: ScoredSkill[] = [];

    // Phase 1: Batch embedding similarity
    if (this.embedder && userMessage.length > 0) {
      try {
        // Collect texts that need embedding (user msg + uncached skills)
        const uncached: { name: string; text: string }[] = [];
        for (const skill of candidates) {
          if (!this.embeddings.has(skill.name)) {
            uncached.push({ name: skill.name, text: `${skill.summary} ${skill.triggers.join(' ')}` });
          }
        }

        // Single batch API call: [userMessage, ...skillTexts]
        const batchTexts = [userMessage, ...uncached.map((u) => u.text)];
        const batchResults = await this.embedder.embedBatch(batchTexts);
        const msgEmbedding = batchResults[0];

        // Cache new skill embeddings
        for (let i = 0; i < uncached.length; i++) {
          this.embeddings.set(uncached[i].name, batchResults[i + 1]);
        }

        if (uncached.length > 0) {
          this.cacheDirty = true;
        }

        // Score all candidates
        for (const skill of candidates) {
          const skillEmbedding = this.embeddings.get(skill.name);
          if (!skillEmbedding) continue;
          const similarity = this.cosineSimilarity(msgEmbedding, skillEmbedding);
          if (similarity > 0.3) {
            scored.push({ skill, score: similarity, source: 'embedding' });
          }
        }

        // Persist to disk if we computed new embeddings
        if (this.cacheDirty) {
          this.saveDiskCache();
          this.cacheDirty = false;
        }
      } catch (err: any) {
        this.logger.debug({ err: err?.message }, 'Embedding match failed, falling back to keyword');
      }
    }

    // Phase 2: Keyword fallback
    const msgLower = userMessage.toLowerCase();
    const embeddedNames = new Set(scored.map((s) => s.skill.name));

    for (const skill of candidates) {
      if (embeddedNames.has(skill.name)) continue;
      let keywordScore = 0;
      for (const trigger of skill.triggers) {
        if (msgLower.includes(trigger.toLowerCase())) {
          keywordScore += trigger.length;
        }
      }
      if (keywordScore > 0) {
        scored.push({ skill, score: keywordScore / 100, source: 'keyword' });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxResults - alwaysLoad.length);

    this.logger.debug(
      {
        embedding: scored.filter((s) => s.source === 'embedding').length,
        keyword: scored.filter((s) => s.source === 'keyword').length,
        total: top.length + alwaysLoad.length,
      },
      'SmartSkillMatcher results',
    );

    return [...alwaysLoad, ...top.map((s) => s.skill)];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Pre-warm embedding cache using batch API call. */
  async preWarm(skillNames: string[]): Promise<void> {
    await this.ensureEmbeddings();
    if (!this.embedder) return;

    const uncached = skillNames
      .map((name) => {
        if (this.embeddings.has(name)) return null;
        const skill = SKILL_REGISTRY.find((s) => s.name === name);
        return skill ? { name, text: `${skill.summary} ${skill.triggers.join(' ')}` } : null;
      })
      .filter(Boolean) as { name: string; text: string }[];

    if (uncached.length === 0) return;

    try {
      const results = await this.embedder.embedBatch(uncached.map((u) => u.text));
      for (let i = 0; i < uncached.length; i++) {
        this.embeddings.set(uncached[i].name, results[i]);
      }
      this.saveDiskCache();
      this.logger.info({ computed: uncached.length, total: this.embeddings.size }, 'SmartSkillMatcher: preWarm complete');
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'SmartSkillMatcher: preWarm failed');
    }
  }
}
