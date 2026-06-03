import { pool } from './index.js';

export interface ChatSessionRow {
  botName: string;
  chatId: string;
  sessionId: string | null;
  sessionIdEngine: string | null;
  workingDirectory: string;
  lastUsed: number;
  cumulativeTokens: number;
  cumulativeCostUsd: number;
  cumulativeDurationMs: number;
  model: string | null;
  modelEngine: string | null;
  engine: string | null;
}

export class ChatSessionStore {
  async listByBot(botName: string): Promise<ChatSessionRow[]> {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE bot_name = $1 ORDER BY last_used DESC',
      [botName],
    );
    return result.rows.map(this.mapRow);
  }

  async get(botName: string, chatId: string): Promise<ChatSessionRow | null> {
    const result = await pool.query(
      'SELECT * FROM chat_sessions WHERE bot_name = $1 AND chat_id = $2',
      [botName, chatId],
    );
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async upsert(row: ChatSessionRow): Promise<void> {
    await pool.query(
      `INSERT INTO chat_sessions (bot_name, chat_id, session_id, session_id_engine, working_directory, last_used, cumulative_tokens, cumulative_cost_usd, cumulative_duration_ms, model, model_engine, engine, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
       ON CONFLICT (bot_name, chat_id) DO UPDATE SET
         session_id = $3, session_id_engine = $4, last_used = $6,
         cumulative_tokens = $7, cumulative_cost_usd = $8, cumulative_duration_ms = $9,
         model = $10, model_engine = $11, engine = $12, updated_at = now()`,
      [row.botName, row.chatId, row.sessionId, row.sessionIdEngine,
       row.workingDirectory, row.lastUsed, row.cumulativeTokens,
       row.cumulativeCostUsd, row.cumulativeDurationMs, row.model, row.modelEngine, row.engine],
    );
  }

  async delete(botName: string, chatId: string): Promise<void> {
    await pool.query(
      'DELETE FROM chat_sessions WHERE bot_name = $1 AND chat_id = $2',
      [botName, chatId],
    );
  }

  async deleteExpired(botName: string, ttlMs: number): Promise<number> {
    const cutoff = Date.now() - ttlMs;
    const result = await pool.query(
      'DELETE FROM chat_sessions WHERE bot_name = $1 AND last_used < $2',
      [botName, cutoff],
    );
    return result.rowCount ?? 0;
  }

  async seedFromJson(botName: string, data: Record<string, any>): Promise<number> {
    let count = 0;
    for (const [chatId, s] of Object.entries(data)) {
      if (!s.sessionId && !s.model && !s.engine) continue;
      await this.upsert({
        botName,
        chatId,
        sessionId: s.sessionId || null,
        sessionIdEngine: s.sessionIdEngine || null,
        workingDirectory: s.workingDirectory || process.cwd(),
        lastUsed: s.lastUsed || Date.now(),
        cumulativeTokens: s.cumulativeTokens ?? 0,
        cumulativeCostUsd: s.cumulativeCostUsd ?? 0,
        cumulativeDurationMs: s.cumulativeDurationMs ?? 0,
        model: s.model || null,
        modelEngine: s.modelEngine || null,
        engine: s.engine || null,
      });
      count++;
    }
    return count;
  }

  private mapRow(r: any): ChatSessionRow {
    return {
      botName: r.bot_name,
      chatId: r.chat_id,
      sessionId: r.session_id,
      sessionIdEngine: r.session_id_engine,
      workingDirectory: r.working_directory,
      lastUsed: Number(r.last_used),
      cumulativeTokens: Number(r.cumulative_tokens),
      cumulativeCostUsd: Number(r.cumulative_cost_usd),
      cumulativeDurationMs: Number(r.cumulative_duration_ms),
      model: r.model,
      modelEngine: r.model_engine,
      engine: r.engine,
    };
  }
}
