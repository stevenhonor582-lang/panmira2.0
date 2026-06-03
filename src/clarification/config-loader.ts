import type { ClarificationConfig } from './types.js';

export const DEFAULT_CONFIG: ClarificationConfig = {
  enabled: false,
  maxQuestionsPerRound: 3,
  sessionTtlHours: 24,
  applicableSkills: [],
  fallbackToLLM: true,
};

export class ConfigLoader {
  constructor(private configs: Record<string, ClarificationConfig>) {}

  load(botId: string): ClarificationConfig {
    const botConfig = this.configs[botId];
    if (!botConfig) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...botConfig };
  }
}
