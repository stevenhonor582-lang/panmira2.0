/**
 * Agent Definition Builder
 *
 * Builds SDK AgentDefinition objects in-memory from PostgreSQL agents table.
 * No file writes — runtime construction only.
 *
 * Reads:
 *  - Single agent by ID (for main bot agent)
 *  - All business expert subagents (for SDK Options.agents map)
 *
 * DB schema note: agents table has tools/skills/knowledge_folders columns
 * but no mcp_servers column (verified 2026-07-05). When mcp_servers is added
 * via future migration, extend AgentRow interface and rowToDefinition().
 *
 * @module sdk-core/agent-definition-builder
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { pool } from '../db/index.js';
import { createLogger, type Logger } from '../utils/logger.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/agent-definition-builder' });

// === Typed Errors ===

/** Thrown when agent lookup by id returns no rows or agent is inactive. */
export class AgentNotFoundError extends Error {
  constructor(public readonly agentId: string) {
    super(`Agent "${agentId}" not found or inactive`);
    this.name = 'AgentNotFoundError';
  }
}

/** Thrown when DB row shape is malformed (e.g. null name). */
export class InvalidAgentRowError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly reason: string,
  ) {
    super(`Invalid agent row "${agentId}": ${reason}`);
    this.name = 'InvalidAgentRowError';
  }
}

// === Types ===

interface AgentRow {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly system_prompt: string | null;
  readonly tools: readonly string[] | null;
  readonly skills: readonly string[] | null;
  readonly knowledge_folders: readonly string[] | null;
}

export interface BusinessExpertMap {
  readonly [agentName: string]: AgentDefinition;
}

// === Agent Definition Builder ===

/**
 * Builds SDK AgentDefinition objects from DB agents rows.
 *
 * Usage:
 *
 * ```ts
 * const builder = new AgentDefinitionBuilder();
 * const main = await builder.buildFromDB(bot.agentId);
 * const experts = await builder.buildBusinessExperts();
 * // pass to query({ options: { agent: bot.name, agents: experts } })
 * ```
 */
export class AgentDefinitionBuilder {
  /**
   * Build SDK AgentDefinition for one agent by id.
   *
   * @param agentId - Agent UUID
   * @returns SDK AgentDefinition (description / prompt / tools / skills)
   * @throws {AgentNotFoundError} if agent missing or inactive
   * @throws {InvalidAgentRowError} if row has null name
   */
  async buildFromDB(agentId: string): Promise<AgentDefinition> {
    const row = await this.queryAgentById(agentId);
    const def = this.rowToDefinition(row);

    LOG.debug(
      { agent_id: agentId, agent_name: row.name, has_prompt: Boolean(row.system_prompt) },
      'AgentDefinition built',
    );

    return def;
  }

  /**
   * Batch-build all active business expert subagents.
   * Returns map keyed by agent name for SDK Options.agents.
   *
   * Selection: active agents with non-null system_prompt.
   * (is_subagent column not present in current schema — using
   * system_prompt IS NOT NULL as proxy until migration adds it.)
   *
   * @returns Record<agentName, AgentDefinition>
   */
  async buildBusinessExperts(): Promise<BusinessExpertMap> {
    const rows = await this.queryBusinessExperts();
    const experts: Record<string, AgentDefinition> = {};

    for (const row of rows) {
      experts[row.name] = this.rowToDefinition(row);
    }

    LOG.info(
      { count: rows.length, names: Object.keys(experts) },
      'Business experts built',
    );

    return experts;
  }

  // === Private ===

  private async queryAgentById(agentId: string): Promise<AgentRow> {
    const { rows } = await pool.query(
      `SELECT id, name, description, system_prompt, tools, skills, knowledge_folders
       FROM agents
       WHERE id = $1::uuid AND is_active = true`,
      [agentId],
    );
    const row = rows[0] as AgentRow | undefined;
    if (!row) {
      LOG.warn({ agentId }, 'Agent not found or inactive');
      throw new AgentNotFoundError(agentId);
    }
    return row;
  }

  private async queryBusinessExperts(): Promise<readonly AgentRow[]> {
    const { rows } = await pool.query(
      `SELECT id, name, description, system_prompt, tools, skills, knowledge_folders
       FROM agents
       WHERE is_active = true AND system_prompt IS NOT NULL`,
    );
    return rows as readonly AgentRow[];
  }

  private rowToDefinition(row: AgentRow): AgentDefinition {
    if (!row.name) {
      throw new InvalidAgentRowError(row.id, 'name is null');
    }

    const tools = this.nonEmpty(row.tools);
    const skills = this.nonEmpty(row.skills);

    return {
      description: row.description || row.name,
      prompt: row.system_prompt || '',
      ...(tools ? { tools } : {}),
      ...(skills ? { skills } : {}),
    };
  }

  private nonEmpty(arr: readonly string[] | null): string[] | undefined {
    if (!arr || arr.length === 0) return undefined;
    return [...arr];
  }
}
