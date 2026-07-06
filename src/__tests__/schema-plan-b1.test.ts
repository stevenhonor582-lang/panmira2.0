import { describe, it, expect } from 'vitest';
import * as schema from '../db/schema.js';

describe('plan-B1 schema: 4 张新表导出', () => {
  it('embedding_providers', () => {
    expect(schema.embeddingProviders).toBeDefined();
  });
  it('mcp_servers', () => {
    expect(schema.mcpServers).toBeDefined();
  });
  it('agent_skill_refs', () => {
    expect(schema.agentSkillRefs).toBeDefined();
  });
  it('skill_usage', () => {
    expect(schema.skillUsage).toBeDefined();
  });
  it('4 张 plan-B1 新表全在', () => {
    const all = Object.keys(schema);
    for (const t of ['embeddingProviders', 'mcpServers', 'agentSkillRefs', 'skillUsage']) {
      expect(all).toContain(t);
    }
  });
});
