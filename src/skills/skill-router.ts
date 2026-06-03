/**
 * Skill Router — selects relevant skills based on user message content.
 * Uses keyword matching against the Skill Registry to pick top-k skills.
 */

import { SKILL_REGISTRY, type SkillMeta } from './skill-registry.js';

const MAX_DYNAMIC_SKILLS = 5;

export class SkillRouter {
  private platform: 'all' | 'feishu';

  constructor(platform: string) {
    this.platform = platform === 'feishu' ? 'feishu' : 'all';
  }

  /** Select skills relevant to the given user message. */
  selectSkills(userMessage: string): SkillMeta[] {
    const available = SKILL_REGISTRY.filter((s) => s.platform === 'all' || s.platform === this.platform);

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
          score += trigger.length; // longer matches score higher
        }
      }
      if (score > 0) {
        scored.push({ skill, score });
      }
    }

    // Sort by score descending, take top-k
    scored.sort((a, b) => b.score - a.score);
    const dynamic = scored.slice(0, MAX_DYNAMIC_SKILLS).map((s) => s.skill);

    return [...alwaysLoad, ...dynamic];
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
      'The following skills are available but not fully loaded. If the user asks about these capabilities, note that they exist but require the full skill to be loaded.',
      '',
      ...lines,
    ].join('\n');
  }
}
