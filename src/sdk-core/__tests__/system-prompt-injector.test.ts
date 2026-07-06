/**
 * Unit tests for SystemPromptInjector
 *
 * Verifies system_prompt lookup behavior for SDK Options.systemPrompt.append:
 * - null agentId returns empty string (Phase α compatibility)
 * - valid agent with prompt returns the prompt string
 * - valid UUID but agent not found returns empty string with warn log
 * - invalid UUID format throws AgentNotFoundError
 * - agent exists but system_prompt column is null returns empty string with warn log
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock by absolute resolved path so both the test file and the SUT share the same
// module identifier (vitest keys mocks by resolved specifier).
vi.mock('/home/ubuntu/panmira/src/db/index.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('/home/ubuntu/panmira/src/utils/logger.js', () => ({
  createLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

import { pool } from '/home/ubuntu/panmira/src/db/index.js';
import { SystemPromptInjector, AgentNotFoundError } from '../system-prompt-injector.js';

describe('SystemPromptInjector', () => {
  let injector: SystemPromptInjector;
  const mockedQuery = vi.mocked(pool.query);

  beforeEach(() => {
    vi.clearAllMocks();
    injector = new SystemPromptInjector();
  });

  it('returns empty string when agentId is null', async () => {
    // Arrange
    const agentId = null;

    // Act
    const result = await injector.inject(agentId);

    // Assert
    expect(result).toBe('');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns the system_prompt string when agent is found', async () => {
    // Arrange
    const agentId = '11111111-2222-3333-4444-555555555555';
    mockedQuery.mockResolvedValueOnce({
      rows: [{ system_prompt: 'test prompt' }],
    } as any);

    // Act
    const result = await injector.inject(agentId);

    // Assert
    expect(result).toBe('test prompt');
    expect(mockedQuery).toHaveBeenCalledTimes(1);
    expect(mockedQuery).toHaveBeenCalledWith(
      'SELECT system_prompt FROM agents WHERE id = $1::uuid',
      [agentId],
    );
  });

  it('returns empty string when valid UUID but agent row does not exist', async () => {
    // Arrange
    const agentId = '22222222-3333-4444-5555-666666666666';
    mockedQuery.mockResolvedValueOnce({ rows: [] } as any);

    // Act
    const result = await injector.inject(agentId);

    // Assert
    expect(result).toBe('');
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('throws AgentNotFoundError when agentId is not a valid UUID', async () => {
    // Arrange
    const invalidAgentId = 'not-a-uuid';

    // Act
    const call = () => injector.inject(invalidAgentId);

    // Assert
    await expect(call).rejects.toThrow(AgentNotFoundError);
    await expect(call).rejects.toThrow(/is not a valid UUID/);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('returns empty string when agent exists but system_prompt is null', async () => {
    // Arrange
    const agentId = '33333333-4444-5555-6666-777777777777';
    mockedQuery.mockResolvedValueOnce({
      rows: [{ system_prompt: null }],
    } as any);

    // Act
    const result = await injector.inject(agentId);

    // Assert
    expect(result).toBe('');
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
