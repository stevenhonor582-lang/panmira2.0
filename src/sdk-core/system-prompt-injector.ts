/**
 * System Prompt Injector
 *
 * Reads agent system_prompt from PostgreSQL agents table and returns
 * a string for SDK Options.systemPrompt.append (PoC E verified format).
 *
 * Phase α: minimal — agent_id may be null (Phase γ populates bot_configs.agent_id).
 * When agent_id is null or agent not found, returns empty string so the
 * main query flow is never blocked.
 *
 * @module sdk-core/system-prompt-injector
 */

import { pool } from '../db/index.js';
import { createLogger, type Logger } from '../utils/logger.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/system-prompt-injector' });

// === Typed Errors ===

/** Thrown when agent_id is provided but is not a valid UUID. */
export class AgentNotFoundError extends Error {
  constructor(public readonly agentId: string) {
    super(`Agent "${agentId}" is not a valid UUID or does not exist`);
    this.name = 'AgentNotFoundError';
  }
}

// === Types ===

/** Result row from agentInstances.system_prompt lookup. */
interface AgentPromptRow {
  system_prompt: string | null;
}

// === System Prompt Injector ===

/**
 * Reads agent system_prompt from DB for SDK Options.systemPrompt.append.
 *
 * Usage:
 * ```ts
 * const injector = new SystemPromptInjector();
 * const append = await injector.inject(bot.agentId);
 * // pass to query({ options: { systemPrompt: { type: 'preset', preset: 'claude_code', append } } })
 * ```
 */
export class SystemPromptInjector {
  /**
   * Read system_prompt from agents table by agent ID.
   *
   * @param agentId - Agent template UUID (from bot_configs.agent_id, Phase γ). Null is allowed.
   * @returns system_prompt string (empty if agentId is null, agent not found, or prompt is null)
   * @throws {AgentNotFoundError} if agentId is provided but is not a valid UUID format
   */
  async inject(agentId: string | null): Promise<string> {
    if (agentId === null) {
      LOG.debug({ agent_id: null }, 'No agent_id; returning empty prompt');
      return '';
    }

    if (!this.isValidUuid(agentId)) {
      LOG.warn({ agent_id: agentId }, 'Invalid UUID format for agent_id');
      throw new AgentNotFoundError(agentId);
    }

    const prompt = await this.queryPrompt(agentId);
    if (prompt === null) {
      LOG.warn({ agent_id: agentId }, 'Agent not found; returning empty prompt');
      return '';
    }

    LOG.debug(
      { agent_id: agentId, prompt_length: prompt.length },
      'System prompt loaded',
    );
    return prompt;
  }

  // === Private ===

  private isValidUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  }

  private async queryPrompt(agentId: string): Promise<string | null> {
    const { rows } = await pool.query(
      `SELECT system_prompt FROM agent_instances WHERE id = $1::uuid`,
      [agentId],
    );
    return rows[0]?.system_prompt ?? null;
  }
}
