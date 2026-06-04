/**
 * Smart Skill Matcher — semantic embedding + keyword hybrid matching.
 * Ranks skills by relevance to user message, replaces pure substring matching.
 */

import { SKILL_REGISTRY, type SkillMeta } from './skill-registry.js';
import type { Logger } from '../utils/logger.js';

interface ScoredSkill {
  skill: SkillMeta;
  score: number;
  /** How the match was made */
  source: 'embedding' | 'keyword' | 'alwaysLoad';
}

export class SmartSkillMatcher {
  private embeddings: Map<string, number[]> = new Map();
  private embedReady = false;
  private embedder: any = null;

  constructor(
    private logger: Logger,
    private platform: string = 'all',
  ) {}

  /**
   * Lazy-init the embedding provider and pre-compute skill embeddings.
   * Called on first match() call.
   */
  private async ensureEmbeddings(): Promise<void> {
    if (this.embedReady) return;

    try {
      // Reuse the same DocEmbedder used for document search
      const { DocEmbedder } = await import('../memory/doc-embedder.js');
      this.embedder = new DocEmbedder(this.logger);
      this.embedReady = true;
    } catch (err: any) {
      this.logger.warn({ err: err?.message }, 'SmartSkillMatcher: embedding unavailable, using keyword-only');
      this.embedReady = true; // don't retry
    }
  }

  /**
   * Match skills to a user message.
   * Returns ranked list: alwaysLoad first, then by relevance score descending.
   * 
   * @param userMessage - the user's input text
   * @param botName - optional bot name for scope filtering
   * @param maxResults - max skills to return (default 10)
   */
  async match(
    userMessage: string,
    botName?: string,
    maxResults: number = 10,
  ): Promise<SkillMeta[]> {
    await this.ensureEmbeddings();

    const platformSkills = SKILL_REGISTRY.filter(
      (s) => s.platform === 'all' || s.platform === this.platform,
    );

    // Scope filter
    const available = botName
      ? platformSkills.filter(
          (s) => !s.scope || s.scope === 'global' || s.ownerBot === botName,
        )
      : platformSkills.filter((s) => !s.scope || s.scope === 'global');

    // Always-load skills come first
    const alwaysLoad = available.filter((s) => s.alwaysLoad);

    // Candidates for matching (non-alwaysLoad with triggers)
    const candidates = available.filter((s) => !s.alwaysLoad && s.triggers.length > 0);

    if (candidates.length === 0) return alwaysLoad;

    const scored: ScoredSkill[] = [];

    // Phase 1: Embedding similarity (if available)
    if (this.embedder && userMessage.length > 0) {
      try {
        const msgEmbedding = await this.embedder.embed(userMessage);

        for (const skill of candidates) {
          // Get or compute skill embedding
          let skillEmbedding = this.embeddings.get(skill.name);
          if (!skillEmbedding) {
            const skillText = `${skill.summary} ${skill.triggers.join(' ')}`;
            skillEmbedding = await this.embedder.embed(skillText);
            this.embeddings.set(skill.name, skillEmbedding);
          }

          const similarity = this.cosineSimilarity(msgEmbedding, skillEmbedding);
          if (similarity > 0.3) {  // minimum relevance threshold
            scored.push({ skill, score: similarity, source: 'embedding' });
          }
        }
      } catch (err: any) {
        this.logger.debug({ err: err?.message }, 'Embedding match failed, falling back to keyword');
      }
    }

    // Phase 2: Keyword fallback (for skills missed by embedding, or when embedding fails)
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
        scored.push({ skill, score: keywordScore / 100, source: 'keyword' }); // normalize
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, maxResults - alwaysLoad.length);
    
    this.logger.debug(
      { 
        embedding: scored.filter(s => s.source === 'embedding').length,
        keyword: scored.filter(s => s.source === 'keyword').length,
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

  /** Get embedding for a skill (exposed for pre-warming cache). */
  async preWarm(skillNames: string[]): Promise<void> {
    await this.ensureEmbeddings();
    if (!this.embedder) return;
    for (const name of skillNames) {
      if (this.embeddings.has(name)) continue;
      const skill = SKILL_REGISTRY.find((s) => s.name === name);
      if (!skill) continue;
      const skillText = `${skill.summary} ${skill.triggers.join(' ')}`;
      try {
        const emb = await this.embedder.embed(skillText);
        this.embeddings.set(name, emb);
      } catch { /* skip on failure */ }
    }
  }
}
