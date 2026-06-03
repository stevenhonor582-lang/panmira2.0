// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { ClarificationError } from './errors.js';
import type { FieldGap, SessionRecord, SessionStatus } from './types.js';

export class SessionStore {
  private pool: any;  // pg.Pool

  constructor(pool: any) {
    this.pool = pool;
  }

  async create(
    userId: string,
    botId: string,
    targetSkill: string,
    missingFields: FieldGap[]
  ): Promise<SessionRecord> {
    const result = await this.pool.query(
      `INSERT INTO clarification_sessions
       (user_id, bot_id, target_skill, missing_fields, status)
       VALUES ($1, $2, $3, $4, 'pending')
       ON CONFLICT (user_id, bot_id, target_skill)
       DO UPDATE SET
         missing_fields = EXCLUDED.missing_fields,
         payload = '{}'::jsonb,
         status = 'pending',
         updated_at = NOW(),
         expires_at = NOW() + INTERVAL '24 hours'
       RETURNING *`,
      [userId, botId, targetSkill, JSON.stringify(missingFields)]
    );
    return this.toRecord(result.rows[0]);
  }

  async get(userId: string, botId: string, targetSkill: string): Promise<SessionRecord | null> {
    const result = await this.pool.query(
      `SELECT * FROM clarification_sessions
       WHERE user_id = $1 AND bot_id = $2 AND target_skill = $3`,
      [userId, botId, targetSkill]
    );
    if (result.rows.length === 0) return null;
    return this.toRecord(result.rows[0]);
  }

  async updatePayload(
    userId: string,
    botId: string,
    targetSkill: string,
    newPayload: Record<string, any>,
    remainingGaps: FieldGap[]
  ): Promise<SessionRecord> {
    const existing = await this.get(userId, botId, targetSkill);
    if (!existing) {
      throw new ClarificationError('SESSION_LOST', `No session: ${userId}/${botId}/${targetSkill}`, true);
    }
    const merged = { ...existing.payload, ...newPayload };
    const result = await this.pool.query(
      `UPDATE clarification_sessions
       SET payload = $1, missing_fields = $2, updated_at = NOW()
       WHERE user_id = $3 AND bot_id = $4 AND target_skill = $5
       RETURNING *`,
      [JSON.stringify(merged), JSON.stringify(remainingGaps), userId, botId, targetSkill]
    );
    return this.toRecord(result.rows[0]);
  }

  async updateStatus(
    userId: string,
    botId: string,
    targetSkill: string,
    status: SessionStatus
  ): Promise<SessionRecord> {
    const result = await this.pool.query(
      `UPDATE clarification_sessions
       SET status = $1, updated_at = NOW()
       WHERE user_id = $2 AND bot_id = $3 AND target_skill = $4
       RETURNING *`,
      [status, userId, botId, targetSkill]
    );
    if (result.rows.length === 0) {
      throw new ClarificationError('SESSION_LOST', `No session to update: ${userId}/${botId}/${targetSkill}`, true);
    }
    return this.toRecord(result.rows[0]);
  }

  async markCompleted(userId: string, botId: string, targetSkill: string): Promise<SessionRecord> {
    return this.updateStatus(userId, botId, targetSkill, 'completed');
  }

  async markAbandoned(userId: string, botId: string, targetSkill: string): Promise<SessionRecord> {
    return this.updateStatus(userId, botId, targetSkill, 'abandoned');
  }

  async deleteExpired(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM clarification_sessions WHERE expires_at < NOW()`
    );
    return result.rowCount || 0;
  }

  private toRecord(row: any): SessionRecord {
    return {
      id: row.id,
      userId: row.user_id,
      botId: row.bot_id,
      targetSkill: row.target_skill,
      payload: row.payload,
      missingFields: row.missing_fields,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
    };
  }
}
