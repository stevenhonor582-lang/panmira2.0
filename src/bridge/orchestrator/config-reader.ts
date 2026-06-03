import type { Logger } from '../../utils/logger.js';
import { pool } from '../../db/index.js';
import type { AgentRuntimeConfig, OrchestrationConfig, BoundaryConfig } from './types.js';

export class ConfigReader {
  constructor(private logger: Logger) {}

  async readFromAgent(agentId: string): Promise<AgentRuntimeConfig | null> {
    try {
      const result = await pool.query(
        `SELECT 
          id, name, system_prompt, knowledge_folders, skills,
          orchestration, boundary, iron_laws
        FROM agents WHERE id = $1 AND is_active = true`,
        [agentId],
      );

      if (result.rows.length === 0) return null;

      const row = result.rows[0];

      return {
        agentId: row.id,
        name: row.name,
        systemPrompt: row.system_prompt || '',
        orchestration: this.parseOrchestration(row.orchestration),
        skills: this.parseJsonArray(row.skills),
        boundary: this.parseBoundary(row.boundary),
        ironLaws: this.parseJsonArray(row.iron_laws).length > 0
          ? this.parseJsonArray(row.iron_laws)
          : this.extractIronLaws(row.system_prompt),
        knowledgeFolders: this.parseJsonArray(row.knowledge_folders),
      };
    } catch (err: any) {
      this.logger.error({ err: err?.message, agentId }, 'Failed to read agent config');
      return null;
    }
  }

  private parseJsonArray(raw: any): string[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private parseOrchestration(raw: any): OrchestrationConfig {
    if (!raw || typeof raw !== 'object') return { intents: [] };
    return {
      intents: Array.isArray(raw.intents) ? raw.intents : [],
    };
  }

  private parseBoundary(raw: any): BoundaryConfig {
    if (!raw || typeof raw !== 'object') {
      return { can: [], cannot: [], escalate_when: [] };
    }
    return {
      can: Array.isArray(raw.can) ? raw.can : [],
      cannot: Array.isArray(raw.cannot) ? raw.cannot : [],
      escalate_when: Array.isArray(raw.escalate_when) ? raw.escalate_when : [],
    };
  }

  private extractIronLaws(systemPrompt: string): string[] {
    if (!systemPrompt) return [];
    const match = systemPrompt.match(/## 铁律[\s\S]*?(?=\n##|$)/);
    if (!match) return [];
    const laws = match[0].match(/^\d+\.\s*(\*\*[^*]+\*\*[^\n]+)/gm);
    return (laws || []).map((l) => l.replace(/^\d+\.\s*/, '').trim());
  }
}
