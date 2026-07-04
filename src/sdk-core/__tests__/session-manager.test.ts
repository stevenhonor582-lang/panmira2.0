/**
 * SDK Session Manager — unit tests
 *
 * Mocks external dependencies (pool / logger) and verifies the
 * pure orchestration logic of SDKSessionManager.
 *
 * Covers:
 *   - resolveBot success / not-found
 *   - buildSessionConfig default + shouldContinue=false
 *   - resolveSlug fallback for unknown names
 *
 * AAA pattern per code-standards.md §9.2.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// --- Mocks (registered before SUT import; vi.mock is hoisted) ---

vi.mock('../../db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
    }),
  }),
}));

// --- SUT import (after mocks are registered) ---

import { SDKSessionManager, BotNotFoundError } from '../session-manager.js';
import { pool } from '../../db/index.js';

// --- Typed handle to the mocked pool.query ---

const queryMock = vi.mocked(pool.query);

// --- Fixture: a 得一 bot_configs row ---

const DEYI_ROW = Object.freeze({
  name: '得一',
  agent_id: 'agent-deyi-001',
});

beforeEach(() => {
  queryMock.mockReset();
});

describe('SDKSessionManager.resolveBot', () => {
  it('returns BotRecord with englishSlug="deyi" when DB row exists for 得一', async () => {
    // Arrange
    queryMock.mockResolvedValueOnce({ rows: [DEYI_ROW] });
    const manager = new SDKSessionManager();

    // Act
    const bot = await manager.resolveBot('得一');

    // Assert
    expect(bot.name).toBe('得一');
    expect(bot.englishSlug).toBe('deyi');
    expect(bot.agentId).toBe('agent-deyi-001');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('throws BotNotFoundError when DB returns no rows', async () => {
    // Arrange
    queryMock.mockResolvedValue({ rows: [] });
    const manager = new SDKSessionManager();

    // Act + Assert
    await expect(manager.resolveBot('玄鉴')).rejects.toBeInstanceOf(
      BotNotFoundError,
    );
    await expect(manager.resolveBot('玄鉴')).rejects.toThrow(/玄鉴.*not found/i);
  });
});

describe('SDKSessionManager.buildSessionConfig', () => {
  it('uses cwd=/home/ubuntu/workspace/deyi, persistSession=true, continue=true by default', () => {
    // Arrange
    const manager = new SDKSessionManager();
    const bot = {
      name: '得一',
      englishSlug: 'deyi',
      agentId: null,
    };

    // Act
    const cfg = manager.buildSessionConfig(bot);

    // Assert
    expect(cfg.cwd).toBe('/home/ubuntu/workspace/deyi');
    expect(cfg.persistSession).toBe(true);
    expect(cfg.continue).toBe(true);
  });

  it('returns continue=false when shouldContinue=false is passed', () => {
    // Arrange
    const manager = new SDKSessionManager();
    const bot = {
      name: '得一',
      englishSlug: 'deyi',
      agentId: null,
    };

    // Act
    const cfg = manager.buildSessionConfig(bot, false);

    // Assert
    expect(cfg.continue).toBe(false);
    expect(cfg.cwd).toBe('/home/ubuntu/workspace/deyi');
    expect(cfg.persistSession).toBe(true);
  });
});

describe('SDKSessionManager.resolveSlug fallback', () => {
  it('returns the original name when botName has no English slug mapping', async () => {
    // Arrange — DB has the row so resolveBot does not throw; the slug
    // map miss is what we are exercising.
    queryMock.mockResolvedValueOnce({
      rows: [{ name: '神秘机器人', agent_id: null }],
    });
    const manager = new SDKSessionManager();

    // Act
    const bot = await manager.resolveBot('神秘机器人');

    // Assert — fallback path returns the input name unchanged
    expect(bot.englishSlug).toBe('神秘机器人');
    expect(bot.name).toBe('神秘机器人');
  });
});
