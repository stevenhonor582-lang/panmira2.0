/**
 * Tests for AgentDefinitionBuilder.
 *
 * Mocks:
 *  - ../db/index.js → pool.query
 *  - ../utils/logger.js → silent logger
 *
 * Covers 5 scenarios per spec:
 *  1. buildFromDB success → AgentDefinition with description/prompt/tools/skills
 *  2. buildFromDB agent missing → AgentNotFoundError
 *  3. buildFromDB null skills → skills=undefined fallback
 *  4. buildBusinessExperts batch → Record<name, AgentDefinition>
 *  5. buildBusinessExperts empty → {} empty object
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentDefinitionBuilder,
  AgentNotFoundError,
} from '../agent-definition-builder.js';
import { pool } from '../../db/index.js';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    child: () => ({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  }),
}));

const query = vi.mocked(pool.query);

beforeEach(() => {
  query.mockReset();
});

describe('AgentDefinitionBuilder', () => {
  describe('buildFromDB', () => {
    it('1. builds AgentDefinition when agent row exists', async () => {
      // Arrange
      const agentId = 'a1111111-1111-1111-1111-111111111111';
      query.mockResolvedValueOnce({
        rows: [
          {
            id: agentId,
            name: 'main-bot',
            description: 'Primary assistant',
            system_prompt: 'You are helpful.',
            tools: ['Read', 'Write'],
            skills: ['skill-a', 'skill-b'],
            knowledge_folders: null,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      // Act
      const builder = new AgentDefinitionBuilder();
      const def = await builder.buildFromDB(agentId);

      // Assert
      expect(def.description).toBe('Primary assistant');
      expect(def.prompt).toBe('You are helpful.');
      expect(def.tools).toEqual(['Read', 'Write']);
      expect(def.skills).toEqual(['skill-a', 'skill-b']);
      // Verify query used uuid parameter
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FROM agents'),
        [agentId],
      );
    });

    it('2. throws AgentNotFoundError when agent missing or inactive', async () => {
      // Arrange
      const agentId = 'b2222222-2222-2222-2222-222222222222';
      query.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      // Act + Assert
      const builder = new AgentDefinitionBuilder();
      await expect(builder.buildFromDB(agentId)).rejects.toBeInstanceOf(
        AgentNotFoundError,
      );
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        [agentId],
      );
    });

    it('3. returns definition without skills field when row.skills is null', async () => {
      // Arrange
      const agentId = 'c3333333-3333-3333-3333-333333333333';
      query.mockResolvedValueOnce({
        rows: [
          {
            id: agentId,
            name: 'no-skill-bot',
            description: 'Skillless bot',
            system_prompt: 'Do stuff',
            tools: ['Read'],
            skills: null,
            knowledge_folders: null,
          },
        ],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      // Act
      const builder = new AgentDefinitionBuilder();
      const def = await builder.buildFromDB(agentId);

      // Assert
      expect(def.prompt).toBe('Do stuff');
      expect(def.tools).toEqual(['Read']);
      // skills omitted entirely (not undefined-as-null)
      expect('skills' in def).toBe(false);
    });
  });

  describe('buildBusinessExperts', () => {
    it('4. builds Record<name, AgentDefinition> for all returned rows', async () => {
      // Arrange
      query.mockResolvedValueOnce({
        rows: [
          {
            id: 'd1',
            name: 'finance-expert',
            description: 'Finance expert',
            system_prompt: 'Handle money',
            tools: ['Calc'],
            skills: ['budgeting'],
            knowledge_folders: null,
          },
          {
            id: 'd2',
            name: 'support-expert',
            description: 'Support expert',
            system_prompt: 'Help users',
            tools: null,
            skills: null,
            knowledge_folders: null,
          },
        ],
        command: '',
        rowCount: 2,
        oid: 0,
        fields: [],
      });

      // Act
      const builder = new AgentDefinitionBuilder();
      const experts = await builder.buildBusinessExperts();

      // Assert
      expect(Object.keys(experts).sort()).toEqual([
        'finance-expert',
        'support-expert',
      ]);
      expect(experts['finance-expert'].description).toBe('Finance expert');
      expect(experts['finance-expert'].skills).toEqual(['budgeting']);
      expect(experts['support-expert'].prompt).toBe('Help users');
      // null tools/skills → omitted
      expect('tools' in experts['support-expert']).toBe(false);
      expect('skills' in experts['support-expert']).toBe(false);
      // Query selects active agents with non-null system_prompt
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('system_prompt IS NOT NULL'),
      );
    });

    it('5. returns empty object when no active business experts', async () => {
      // Arrange
      query.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      // Act
      const builder = new AgentDefinitionBuilder();
      const experts = await builder.buildBusinessExperts();

      // Assert
      expect(experts).toEqual({});
      expect(Object.keys(experts)).toHaveLength(0);
    });
  });
});
