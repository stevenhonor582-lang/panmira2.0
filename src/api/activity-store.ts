import * as crypto from 'node:crypto';
import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface ActivityEvent {
  id: string;
  type: 'task_started' | 'task_completed' | 'task_failed';
  botName: string;
  chatId: string;
  userId?: string;
  prompt?: string;
  responsePreview?: string;
  costUsd?: number;
  durationMs?: number;
  errorMessage?: string;
  timestamp: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  model?: string;
}

const MAX_BUFFER_SIZE = 100;
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export class ActivityStore {
  private buffer: ActivityEvent[] = [];

  constructor(private logger: Logger) {
    this.migrate();
    this.cleanup();
    this.loadBuffer();
    this.logger.info('Activity store initialized');
  }

  private async loadBuffer(): Promise<void> {
    this.buffer = await this.list({ limit: MAX_BUFFER_SIZE });
  }

  private async migrate(): Promise<void> {
    await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS input_tokens INT DEFAULT 0`);
    await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS output_tokens INT DEFAULT 0`);
    await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS cache_read_tokens INT DEFAULT 0`);
    await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS cache_creation_tokens INT DEFAULT 0`);
    await pool.query(`ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS model TEXT`);
  }

  async record(event: Omit<ActivityEvent, 'id'>): Promise<ActivityEvent> {
    const id = crypto.randomUUID();
    const full: ActivityEvent = { id, ...event };

    await pool.query(
      `
      INSERT INTO activity_events (id, type, bot_name, chat_id, user_id, prompt, response_preview, cost_usd, duration_ms, error_message, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, model)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `,
      [
        id,
        event.type,
        event.botName,
        event.chatId,
        event.userId || null,
        event.prompt?.slice(0, 200) || null,
        event.responsePreview?.slice(0, 200) || null,
        event.costUsd || null,
        event.durationMs || null,
        event.errorMessage?.slice(0, 500) || null,
        event.timestamp,
        event.inputTokens || 0,
        event.outputTokens || 0,
        event.cacheReadTokens || 0,
        event.cacheCreationTokens || 0,
        event.model || null,
      ],
    );

    this.buffer.unshift(full);
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      this.buffer.pop();
    }

    return full;
  }

  async list(opts: { limit?: number; botName?: string; since?: number } = {}): Promise<ActivityEvent[]> {
    const { limit = 50, botName, since } = opts;

    let sql = 'SELECT * FROM activity_events WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;

    if (botName) {
      sql += ` AND bot_name = $${paramIdx++}`;
      params.push(botName);
    }
    if (since) {
      sql += ` AND timestamp > $${paramIdx++}`;
      params.push(since);
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${paramIdx}`;
    params.push(limit);

    const { rows } = await pool.query(sql, params);
    return rows.map(this.mapRow);
  }

  getRecent(limit = 50): ActivityEvent[] {
    return this.buffer.slice(0, limit);
  }

  async cleanup(): Promise<void> {
    // Disabled — activity_events kept permanently as billing records.
  }

  close(): void {}

  private mapRow(row: any): ActivityEvent {
    return {
      id: row.id,
      type: row.type,
      botName: row.bot_name,
      chatId: row.chat_id,
      userId: row.user_id || undefined,
      prompt: row.prompt || undefined,
      responsePreview: row.response_preview || undefined,
      costUsd: row.cost_usd || undefined,
      durationMs: row.duration_ms || undefined,
      errorMessage: row.error_message || undefined,
      timestamp: row.timestamp,
      inputTokens: row.input_tokens || undefined,
      outputTokens: row.output_tokens || undefined,
      cacheReadTokens: row.cache_read_tokens || undefined,
      cacheCreationTokens: row.cache_creation_tokens || undefined,
      model: row.model || undefined,
    };
  }
}
