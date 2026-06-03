import { pool } from './index.js';

export interface CoordinatorConfigRow {
  id: string;
  groupId: string;
  groupName: string;
  coordinatorBot: string;
  teamMembers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export class CoordinatorConfigStore {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coordinator_configs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        group_id TEXT NOT NULL UNIQUE,
        group_name TEXT NOT NULL DEFAULT '',
        coordinator_bot TEXT NOT NULL,
        team_members JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`ALTER TABLE coordinator_configs ADD COLUMN IF NOT EXISTS group_name TEXT NOT NULL DEFAULT ''`);
    this.initialized = true;
  }

  async list(): Promise<CoordinatorConfigRow[]> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM coordinator_configs ORDER BY group_id');
    return rows.map(this.mapRow);
  }

  async findByGroupId(groupId: string): Promise<CoordinatorConfigRow | null> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM coordinator_configs WHERE group_id = $1', [groupId]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async upsert(
    groupId: string,
    data: { groupName?: string; coordinatorBot?: string; teamMembers?: string[] },
  ): Promise<CoordinatorConfigRow> {
    await this.init();
    const { rows } = await pool.query(
      `INSERT INTO coordinator_configs (group_id, group_name, coordinator_bot, team_members)
       VALUES ($1, $4, $2, $3)
       ON CONFLICT (group_id) DO UPDATE SET
         group_name = COALESCE($4, coordinator_configs.group_name),
         coordinator_bot = COALESCE($2, coordinator_configs.coordinator_bot),
         team_members = COALESCE($3, coordinator_configs.team_members),
         updated_at = now()
       RETURNING *`,
      [
        groupId,
        data.coordinatorBot || null,
        data.teamMembers ? JSON.stringify(data.teamMembers) : null,
        data.groupName || null,
      ],
    );
    return this.mapRow(rows[0]);
  }

  async delete(groupId: string): Promise<boolean> {
    await this.init();
    const result = await pool.query('DELETE FROM coordinator_configs WHERE group_id = $1', [groupId]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRow(r: any): CoordinatorConfigRow {
    return {
      id: r.id,
      groupId: r.group_id,
      groupName: r.group_name || '',
      coordinatorBot: r.coordinator_bot,
      teamMembers: typeof r.team_members === 'string' ? JSON.parse(r.team_members) : r.team_members || [],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
