/**
 * BindingEngine — PostgreSQL-backed routing rules for multi-agent groups.
 * Allows admin-panel or API-driven configuration of which specialists
 * handle which messages in which groups.
 */
import { query } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface RoutingBinding {
  id: string;
  groupId: string;
  pattern: string | null;
  targetBots: string[];
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface BindingRow {
  id: string;
  group_id: string;
  pattern: string | null;
  target_bots: string[];
  priority: number;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function rowToBinding(row: BindingRow): RoutingBinding {
  return {
    id: row.id,
    groupId: row.group_id,
    pattern: row.pattern,
    targetBots: row.target_bots,
    priority: row.priority,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class BindingEngine {
  constructor(private logger: Logger) {}

  /** Find matching bindings for a group + message. Returns target bot names. */
  async findMatches(groupId: string, message: string): Promise<string[]> {
    const result = await query(
      `SELECT target_bots FROM routing_bindings
       WHERE group_id = $1 AND enabled = true
       ORDER BY priority DESC`,
      [groupId],
    );

    const rows = result.rows as BindingRow[];
    for (const row of rows) {
      if (!row.pattern) return row.target_bots;
      try {
        const regex = new RegExp(row.pattern, 'i');
        if (regex.test(message)) return row.target_bots;
      } catch {
        this.logger.warn({ pattern: row.pattern }, 'BindingEngine: invalid regex pattern');
      }
    }
    return [];
  }

  /** List all bindings, optionally filtered by group. */
  async list(groupId?: string): Promise<RoutingBinding[]> {
    const sql = groupId
      ? 'SELECT * FROM routing_bindings WHERE group_id = $1 ORDER BY priority DESC'
      : 'SELECT * FROM routing_bindings ORDER BY group_id, priority DESC';
    const params = groupId ? [groupId] : [];
    const result = await query(sql, params);
    return (result.rows as BindingRow[]).map(rowToBinding);
  }

  /** Create a new binding. */
  async create(data: {
    groupId: string;
    pattern?: string;
    targetBots: string[];
    priority?: number;
    enabled?: boolean;
  }): Promise<RoutingBinding> {
    const result = await query(
      `INSERT INTO routing_bindings (group_id, pattern, target_bots, priority, enabled)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.groupId, data.pattern ?? null, data.targetBots, data.priority ?? 50, data.enabled ?? true],
    );
    return rowToBinding(result.rows[0] as BindingRow);
  }

  /** Update a binding. */
  async update(
    id: string,
    data: Partial<Pick<RoutingBinding, 'pattern' | 'targetBots' | 'priority' | 'enabled'>>,
  ): Promise<RoutingBinding | null> {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (data.pattern !== undefined) { sets.push(`pattern = $${idx++}`); params.push(data.pattern); }
    if (data.targetBots !== undefined) { sets.push(`target_bots = $${idx++}`); params.push(data.targetBots); }
    if (data.priority !== undefined) { sets.push(`priority = $${idx++}`); params.push(data.priority); }
    if (data.enabled !== undefined) { sets.push(`enabled = $${idx++}`); params.push(data.enabled); }

    if (sets.length === 0) return null;
    sets.push(`updated_at = now()`);
    params.push(id);

    const result = await query(
      `UPDATE routing_bindings SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return result.rows.length ? rowToBinding(result.rows[0] as BindingRow) : null;
  }

  /** Delete a binding. */
  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM routing_bindings WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
