import { describe, it, expect, vi } from 'vitest';
import { MemoryBridge } from '../../src/memory/memory-bridge.js';

const mockPool = () => ({
  query: vi.fn().mockResolvedValue({ rows: [{ id: 'mem-1', content: '采集摘要', metadata_json: { source: 'team-pipeline', stage: 'collect' } }] }),
});

describe('MemoryBridge', () => {
  it('writeStageOutput runs INSERT INTO memories with team-pipeline source', async () => {
    const pool = mockPool();
    const mb = new MemoryBridge({ pool });
    await mb.writeStageOutput({ chatId: 't1', botName: '得一', sceneType: 'data' }, 'collect', { foo: 'bar' });
    expect(pool.query).toHaveBeenCalledTimes(1);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO memories');
    const params = pool.query.mock.calls[0][1];
    expect(params).toContain('team-pipeline');        // user_id
    expect(JSON.parse(params[2])).toMatchObject({ source: 'team-pipeline', stage: 'collect', scene_type: 'data' }); // metadataJson index 5: [content, user_id, metadataJson, subject, subject, botName]
  });

  it('readMemories runs SELECT with bot_name + scene_type filter', async () => {
    const pool = mockPool();
    const mb = new MemoryBridge({ pool });
    await mb.readMemories({ botName: '得一', sceneType: 'data' }, 'data', 10);
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toContain('SELECT');
    expect(sql).toContain('scene_type');
    const params = pool.query.mock.calls[0][1];
    expect(params).toContain('得一');
    expect(params).toContain('data');
    expect(params).toContain(10);
  });
});
