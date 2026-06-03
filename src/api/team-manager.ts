import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface Team {
  id: string;
  name: string;
  members: string[];
  roles: Record<string, string>;
  budgetDailyUsd: number;
  createdAt: number;
  updatedAt: number;
}

export class TeamManager {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: 'team-manager' });
  }

  async create(name: string, members: string[] = [], budgetDailyUsd: number = 0): Promise<Team> {
    const id = `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();
    await pool.query(
      'INSERT INTO teams (id, name, members, roles, budget_daily_usd, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, name, JSON.stringify(members), '{}', budgetDailyUsd, now, now],
    );
    return { id, name, members, roles: {}, budgetDailyUsd, createdAt: now, updatedAt: now };
  }

  async get(id: string): Promise<Team | undefined> {
    const result = await pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? this.rowToTeam(row) : undefined;
  }

  async getByName(name: string): Promise<Team | undefined> {
    const result = await pool.query('SELECT * FROM teams WHERE name = $1', [name]);
    const row = result.rows[0];
    return row ? this.rowToTeam(row) : undefined;
  }

  async list(): Promise<Team[]> {
    const result = await pool.query('SELECT * FROM teams ORDER BY created_at DESC');
    return result.rows.map((r: any) => this.rowToTeam(r));
  }

  async update(
    id: string,
    updates: Partial<Pick<Team, 'name' | 'members' | 'roles' | 'budgetDailyUsd'>>,
  ): Promise<Team | undefined> {
    const team = await this.get(id);
    if (!team) return undefined;

    const newName = updates.name ?? team.name;
    const newMembers = updates.members ?? team.members;
    const newRoles = updates.roles ?? team.roles;
    const newBudget = updates.budgetDailyUsd ?? team.budgetDailyUsd;
    const now = Date.now();

    await pool.query('UPDATE teams SET name=$1, members=$2, roles=$3, budget_daily_usd=$4, updated_at=$5 WHERE id=$6', [
      newName,
      JSON.stringify(newMembers),
      JSON.stringify(newRoles),
      newBudget,
      now,
      id,
    ]);

    return { ...team, name: newName, members: newMembers, roles: newRoles, budgetDailyUsd: newBudget, updatedAt: now };
  }

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM teams WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async saveGroupMembership(groupId: string, botName: string): Promise<void> {
    await pool.query(
      'INSERT INTO group_memberships (group_id, bot_name, joined_at) VALUES ($1, $2, $3) ON CONFLICT (group_id, bot_name) DO UPDATE SET joined_at = EXCLUDED.joined_at',
      [groupId, botName, Date.now()],
    );
  }

  async getGroupMembers(groupId: string): Promise<string[]> {
    const result = await pool.query('SELECT bot_name FROM group_memberships WHERE group_id = $1', [groupId]);
    return result.rows.map((r: any) => r.bot_name);
  }

  async removeGroupMembership(groupId: string, botName: string): Promise<void> {
    await pool.query('DELETE FROM group_memberships WHERE group_id = $1 AND bot_name = $2', [groupId, botName]);
  }

  async deleteGroup(groupId: string): Promise<void> {
    await pool.query('DELETE FROM group_memberships WHERE group_id = $1', [groupId]);
  }

  private rowToTeam(row: any): Team {
    return {
      id: row.id,
      name: row.name,
      members: JSON.parse(row.members),
      roles: JSON.parse(row.roles),
      budgetDailyUsd: row.budget_daily_usd,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  destroy(): void {}
}
