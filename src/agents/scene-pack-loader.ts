// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPool = { query: (...args: any[]) => Promise<any> };
import type { SceneType } from '../orchestrator/orchestrator.js';
import type { ExpertConfig } from './expert-subagent.js';

export type Stage = 'collect' | 'analyze' | 'produce' | 'review';

export interface ScenePack {
  sceneType: SceneType;
  name: string;
  experts: Partial<Record<Stage, ExpertConfig>>;
}

export class ScenePackLoader {
  constructor(private opts: { pool: AnyPool }) {}

  async load(sceneType: SceneType): Promise<ScenePack> {
    const r = await this.opts.pool.query(
      `SELECT sp.scene_type, sp.name, spe.stage, spe.expert_name, spe.engine, spe.prompt
       FROM scene_packs sp
       LEFT JOIN scene_pack_experts spe ON spe.scene_pack_id = sp.id
       WHERE sp.scene_type = $1
       ORDER BY spe.position ASC`,
      [sceneType],
    );
    const rows = r.rows;
    if (rows.length === 0) throw new Error(`ScenePack not found: ${sceneType}`);
    const pack: ScenePack = {
      sceneType,
      name: rows[0].name,
      experts: {},
    };
    for (const row of rows) {
      if (row.stage) {
        pack.experts[row.stage as Stage] = {
          name: row.expert_name,
          engine: row.engine,
          prompt: row.prompt,
        };
      }
    }
    return pack;
  }
}
