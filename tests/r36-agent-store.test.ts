import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/index.js', () => ({
  pool: { query: vi.fn() },
  db: {},
}));

import { AgentStore } from '../src/db/agent-store.js';
import { pool } from '../src/db/index.js';

const AGENT_ID = '11111111-1111-1111-1111-111111111111';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: AGENT_ID,
    tenant_id: 'tenant-1',
    name: 'test-agent',
    role_template: 'general',
    description: null,
    capabilities: [],
    tools: [],
    system_prompt: null,
    is_active: true,
    category: 'general',
    template_type: 'custom',
    source_template_id: null,
    knowledge_folders: [],
    skills: [],
    orchestration: {},
    boundary: {},
    iron_laws: [],
    default_engine: 'minimax',
    default_model: 'MiniMax-M3',
    default_context_window: 512000,
    default_max_turns: null,
    complexity_level: 'L2',
    status: 'active',
    persona: null,
    engine: null,
    display_name: null,
    owner_user_id: null,
    model_id: null,
    avatar_url: null,
    avatar_glyph: null,
    avatar_hue: null,
    deployment_type: 'bot',
    is_template: false,
    working_dir: null,
    channel_ids: [],
    visibility: 'team',
    temperature: 0.7,
    created_at: new Date('2026-07-10T00:00:00Z'),
    updated_at: new Date('2026-07-10T00:00:00Z'),
    ...overrides,
  };
}

describe('R36 AgentStore context window update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(pool.query).mockResolvedValue({ rows: [row()], rowCount: 1 } as never);
  });

  it('updates a 512K default context window with one SQL assignment', async () => {
    const store = new AgentStore();

    const updated = await store.update(AGENT_ID, { defaultContextWindow: 512000 });

    expect(updated?.defaultContextWindow).toBe(512000);
    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(pool.query).mock.calls[0];
    const assignments = String(sql).match(/default_context_window\s*=\s*\$/g) ?? [];
    expect(assignments).toHaveLength(1);
    expect(params).toEqual([512000, AGENT_ID]);
  });
});
