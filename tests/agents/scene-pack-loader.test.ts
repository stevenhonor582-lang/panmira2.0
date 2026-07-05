import { describe, it, expect, vi } from 'vitest';
import { ScenePackLoader } from '../../src/agents/scene-pack-loader.js';

describe('ScenePackLoader', () => {
  it('load("data") returns ScenePack with 4 stages from DB rows', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { scene_type: 'data', name: '数据场景', stage: 'collect', expert_name: '数据采集', engine: 'minimax-m3', prompt: '采集专家' },
          { scene_type: 'data', name: '数据场景', stage: 'analyze', expert_name: '数据分析', engine: 'anthropic-opus-4-7', prompt: '分析专家' },
          { scene_type: 'data', name: '数据场景', stage: 'produce', expert_name: '报告产出', engine: 'anthropic-opus-4-7', prompt: '产出专家' },
          { scene_type: 'data', name: '数据场景', stage: 'review', expert_name: '审查官', engine: 'anthropic-opus-4-7', prompt: '审查' },
        ],
      }),
    };
    const loader = new ScenePackLoader({ pool });
    const pack = await loader.load('data');
    expect(pack.sceneType).toBe('data');
    expect(pack.name).toBe('数据场景');
    expect(pack.experts.collect?.name).toBe('数据采集');
    expect(pack.experts.collect?.engine).toBe('minimax-m3');
    expect(pack.experts.analyze?.name).toBe('数据分析');
    expect(pack.experts.produce?.name).toBe('报告产出');
    expect(pack.experts.review?.name).toBe('审查官');
  });

  it('load throws on missing scene pack', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const loader = new ScenePackLoader({ pool });
    await expect(loader.load('unknown')).rejects.toThrow('ScenePack not found');
  });

  it('load uses parameterized query (no SQL injection)', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const loader = new ScenePackLoader({ pool });
    await loader.load("data'; DROP TABLE scene_packs; --").catch(() => {});
    expect(pool.query.mock.calls[0][1]).toEqual(["data'; DROP TABLE scene_packs; --"]);
  });
});
