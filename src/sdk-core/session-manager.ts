/**
 * SDK Session Manager
 *
 * Manages SDK session lifecycle: cwd resolution, persistSession, continue.
 *
 * Each bot has an isolated cwd (English slug) so SDK projectKey
 * isolation works correctly. PoC D verified this works.
 *
 * @module sdk-core/session-manager
 */

import { pool } from '../db/index.js';
import { createLogger, type Logger } from '../utils/logger.js';

const LOG: Logger = createLogger('info').child({ module: 'sdk-core/session-manager' });

const WORKSPACE_BASE = '/home/ubuntu/workspace';

/**
 * Temporary slug map (Phase α).
 * Phase β migration V021 will add english_slug column to bot_configs.
 */
const BOT_SLUG_MAP: Readonly<Record<string, string>> = Object.freeze({
  '得一': 'deyi',
  '玄鉴': 'xuanjian',
  '不盈': 'buying',
  '守静': 'shoujing',
  '信言': 'xinyan',
});

// === Typed Errors ===

/** Thrown when bot_configs lookup fails or bot is inactive. */
export class BotNotFoundError extends Error {
  constructor(public readonly botName: string) {
    super(`Bot "${botName}" not found in bot_configs or is inactive`);
    this.name = 'BotNotFoundError';
  }
}

/** Thrown when session resumption is attempted but JSONL is missing. */
export class SessionResumptionError extends Error {
  constructor(
    public readonly sessionId: string,
    public readonly botName: string,
    public readonly cause?: unknown,
  ) {
    super(`Failed to resume session ${sessionId} for bot ${botName}`);
    this.name = 'SessionResumptionError';
  }
}

// === Types ===

export interface BotRecord {
  /** Bot display name (Chinese, e.g. 得一). */
  readonly name: string;
  /** English slug for cwd (e.g. deyi). */
  readonly englishSlug: string;
  /** Optional agent template ID (Phase γ will populate). */
  readonly agentId: string | null;
}

export interface SessionCwdConfig {
  /** Absolute path to bot workspace, e.g. /home/ubuntu/workspace/deyi. */
  readonly cwd: string;
  /** Always true in panmira 2.0 — sessions persist for resume. */
  readonly persistSession: true;
  /** True to resume previous session in same cwd. */
  readonly continue: boolean;
}

interface BotConfigRow {
  name: string;
  agent_id: string | null;
}

// === Session Manager ===

/**
 * Resolves bot workspace cwd and configures SDK session persistence.
 *
 * Usage:
 * ```ts
 * const session = new SDKSessionManager();
 * const bot = await session.resolveBot('得一');
 * const config = session.buildSessionConfig(bot);
 * // pass config to query({ options: { ...config, ... } })
 * ```
 */
export class SDKSessionManager {
  /**
   * Resolve bot record from DB by Chinese name.
   *
   * @param botName - Bot Chinese name (得一 / 玄鉴 / etc.)
   * @returns Bot record with english_slug for cwd resolution
   * @throws {BotNotFoundError} if bot not in bot_configs or is_active=false
   */
  async resolveBot(botName: string): Promise<BotRecord> {
    const bot = await this.queryBot(botName);
    const englishSlug = this.resolveSlug(botName);

    LOG.debug(
      { bot_name: bot.name, english_slug: englishSlug, agent_id: bot.agent_id },
      'Bot resolved',
    );

    return {
      name: bot.name,
      englishSlug,
      agentId: bot.agent_id,
    };
  }

  /**
   * Build SDK session cwd config for a bot.
   *
   * @param bot - Resolved bot record
   * @param shouldContinue - Whether to continue previous session in this cwd (default: true)
   * @returns SDK Options partial with cwd, persistSession, continue
   */
  buildSessionConfig(bot: BotRecord, shouldContinue = true): SessionCwdConfig {
    const cwd = `${WORKSPACE_BASE}/${bot.englishSlug}`;

    LOG.debug(
      { bot_name: bot.name, cwd, continue: shouldContinue },
      'Session config built',
    );

    return { cwd, persistSession: true, continue: shouldContinue };
  }

  /**
   * Check if a session JSONL file exists for the given bot + session ID.
   * Used to validate session resumption feasibility before query.
   *
   * @param bot - Bot record (for cwd)
   * @param sessionId - SDK session ID
   * @returns True if JSONL file exists, false otherwise
   */
  async hasSessionJsonl(bot: BotRecord, sessionId: string): Promise<boolean> {
    const fs = await import('node:fs/promises');
    const { homedir } = await import('node:os');
    const { join } = await import('node:path');

    const encodedCwd = `${WORKSPACE_BASE}/${bot.englishSlug}`.replace(/\//g, '-');
    const jsonlPath = join(
      homedir(),
      '.claude',
      'projects',
      encodedCwd,
      `${sessionId}.jsonl`,
    );

    try {
      await fs.access(jsonlPath);
      return true;
    } catch {
      LOG.warn({ sessionId, jsonlPath }, 'Session JSONL not found');
      return false;
    }
  }

  // === Private ===

  private async queryBot(botName: string): Promise<BotConfigRow> {
    // agent_id stored in config_json JSONB (per panmira 1.0 schema)
    const { rows } = await pool.query(
      `SELECT name, config_json->>'agentId' AS agent_id
         FROM bot_configs
        WHERE name = $1 AND is_active = true`,
      [botName],
    );
    if (!rows[0]) {
      LOG.warn({ botName }, 'Bot not found or inactive');
      throw new BotNotFoundError(botName);
    }
    return rows[0];
  }

  private resolveSlug(botName: string): string {
    const slug = BOT_SLUG_MAP[botName];
    if (!slug) {
      LOG.warn({ botName }, 'No English slug mapping; using fallback');
      return botName;
    }
    return slug;
  }
}
