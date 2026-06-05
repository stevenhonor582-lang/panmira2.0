/**
 * Skill Router — selects relevant skills based on user message content.
 * Uses keyword matching against the Skill Registry to pick top-k skills.
 * Now respects bot-level skill bindings (enable/disable) and scope.
 */

import { SKILL_REGISTRY, type SkillMeta } from './skill-registry.js';
import { SmartSkillMatcher } from './skill-matcher.js';
import { pool } from '../db/index.js';

const MAX_DYNAMIC_SKILLS = 5;

export class SkillRouter {
  private platform: 'all' | 'feishu';
  private smartMatcher: SmartSkillMatcher | null = null;

  constructor(platform: string) {
    this.platform = platform === 'feishu' ? 'feishu' : 'all';
  }

  /** Set logger for smart matching (called after construction). */
  setLogger(logger: any) {
    this.smartMatcher = new SmartSkillMatcher(logger, this.platform);
  }

  /** Select skills relevant to the given user message and bot. */
  selectSkills(userMessage: string, botName?: string): SkillMeta[] {
    // Sync wrapper — actual matching is sync (keyword) with async upgrade path
    return this.selectSkillsSync(userMessage, botName);
  }

  /** Async version with semantic matching. Use this when logger is available. */
  async selectSkillsAsync(userMessage: string, botName?: string): Promise<SkillMeta[]> {
    if (this.smartMatcher && userMessage.length > 3) {
      try {
        return await this.smartMatcher.match(userMessage, botName, 10);
      } catch { /* fall through to keyword */ }
    }
    return this.selectSkillsSync(userMessage, botName);
  }

  private selectSkillsSync(userMessage: string, botName?: string): SkillMeta[] {
    const available = this.getAvailableForBot(botName);

    // Always-load skills
    const alwaysLoad = available.filter((s) => s.alwaysLoad);

    // Keyword matching for dynamic skills
    const msgLower = userMessage.toLowerCase();
    const scored: Array<{ skill: SkillMeta; score: number }> = [];

    for (const skill of available) {
      if (skill.alwaysLoad) continue;
      if (skill.triggers.length === 0) continue;

      let score = 0;
      for (const trigger of skill.triggers) {
        if (msgLower.includes(trigger.toLowerCase())) {
          score += trigger.length;
        }
      }
      if (score > 0) {
        scored.push({ skill, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const dynamic = scored.slice(0, MAX_DYNAMIC_SKILLS).map((s) => s.skill);

    return [...alwaysLoad, ...dynamic];
  }

  /**
   * Get skill names that are enabled for a specific bot.
   * Falls back to all global skills if no bindings exist (new bot).
   */
  async getEnabledSkillNames(botName: string): Promise<Set<string>> {
    try {
      const { rows } = await pool.query(
        `SELECT skill_name FROM bot_skill_bindings WHERE bot_name = $1 AND enabled = true`,
        [botName],
      );
      if (rows.length > 0) {
        return new Set(rows.map((r: any) => r.skill_name));
      }
    } catch {
      // Table might not exist yet — fall through to default
    }
    // New bot with no bindings: default to all global skills
    return new Set(
      SKILL_REGISTRY
        .filter((s) => (!s.scope || s.scope === 'global') && (s.platform === 'all' || s.platform === this.platform))
        .map((s) => s.name),
    );
  }

  /** Get skills available to a specific bot, considering scope and bindings. */
  private getAvailableForBot(botName?: string): SkillMeta[] {
    const platformMatch = SKILL_REGISTRY.filter(
      (s) => s.platform === 'all' || s.platform === this.platform,
    );

    if (!botName) {
      // No bot context — return global skills only
      return platformMatch.filter((s) => !s.scope || s.scope === 'global');
    }

    // Include: global skills + bot-private skills owned by this bot
    return platformMatch.filter(
      (s) => !s.scope || s.scope === 'global' || (s.scope === 'bot' && s.ownerBot === botName),
    );
  }

  /** Pre-warm all skill embeddings (call at startup). */
  async preWarmAll(): Promise<void> {
    if (!this.smartMatcher) return;
    const allNames = this.getAllStagedSkillNames();
    await this.smartMatcher.preWarm(allNames);
  }

  /** Get names of all skills that should be staged (for pre-loading). */
  getAllStagedSkillNames(): string[] {
    return SKILL_REGISTRY.filter((s) => s.platform === 'all' || s.platform === this.platform).map((s) => s.name);
  }

  /** Generate a skill index markdown for the skills NOT loaded (summary only). */
  generateSkillIndex(selectedNames: Set<string>): string {
    const available = SKILL_REGISTRY.filter(
      (s) => (s.platform === 'all' || s.platform === this.platform) && !selectedNames.has(s.name),
    );
    if (available.length === 0) return '';

    const lines = available.map((s) => `- **${s.name}**: ${s.summary}`);
    return [
      '## Available Skills (summary only)\n',
      'The following skills are available but not fully loaded.',
      '',
      ...lines,
    ].join('\n');
  }
}
