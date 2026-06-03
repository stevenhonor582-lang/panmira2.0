import * as crypto from 'node:crypto';
import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

export interface SessionRecord {
  id: string;
  botName: string;
  claudeSessionId?: string;
  workingDirectory: string;
  title: string;
  platform: string;
  chatId: string;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
}

export interface SessionMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
  platform: string;
  costUsd?: number;
  durationMs?: number;
}

export interface SessionLink {
  chatId: string;
  platform: string;
  linkedAt: number;
}

const MAX_MESSAGES_PER_SESSION = 200;

export class SessionRegistry {
  constructor(private logger: Logger) {
    this.logger.info('Session registry initialized');
  }

  static detectPlatform(chatId: string): string {
    if (chatId.startsWith('oc_') || chatId.startsWith('ou_')) return 'feishu';
    if (/^\d+$/.test(chatId)) return 'telegram';
    if (chatId.startsWith('ios_')) return 'ios';
    return 'web';
  }

  async createOrUpdate(opts: {
    chatId: string;
    botName: string;
    claudeSessionId?: string;
    workingDirectory: string;
    prompt: string;
    responseText?: string;
    costUsd?: number;
    durationMs?: number;
  }): Promise<string> {
    const { chatId, botName, claudeSessionId, workingDirectory, prompt, responseText, costUsd, durationMs } = opts;
    const platform = SessionRegistry.detectPlatform(chatId);
    const now = Date.now();

    let session: SessionRecord | null = await this.findByChatId(chatId);

    if (session) {
      const updates: string[] = ['updated_at = $1'];
      const params: any[] = [now];
      let paramIdx = 2;

      if (claudeSessionId) {
        updates.push(`claude_session_id = $${paramIdx++}`);
        params.push(claudeSessionId);
      }

      params.push(chatId);
      await pool.query(`UPDATE sessions SET ${updates.join(', ')} WHERE chat_id = $${paramIdx}`, params);

      const linkResult = await pool.query('SELECT session_id FROM session_links WHERE chat_id = $1', [chatId]);
      if (linkResult.rows.length > 0) {
        await pool.query(
          'UPDATE sessions SET updated_at = $1, claude_session_id = COALESCE($2, claude_session_id) WHERE id = $3',
          [now, claudeSessionId || null, linkResult.rows[0].session_id],
        );
        session = await this.getSession(linkResult.rows[0].session_id);
      }
    } else {
      const linkResult = await pool.query('SELECT session_id FROM session_links WHERE chat_id = $1', [chatId]);
      if (linkResult.rows.length > 0) {
        await pool.query(
          'UPDATE sessions SET updated_at = $1, claude_session_id = COALESCE($2, claude_session_id) WHERE id = $3',
          [now, claudeSessionId || null, linkResult.rows[0].session_id],
        );
        session = await this.getSession(linkResult.rows[0].session_id);
      } else {
        const id = crypto.randomUUID();
        const title = prompt.slice(0, 60).replace(/\n/g, ' ');
        await pool.query(
          `INSERT INTO sessions (id, bot_name, claude_session_id, working_directory, title, platform, chat_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [id, botName, claudeSessionId || null, workingDirectory, title, platform, chatId, now, now],
        );
        session = {
          id,
          botName,
          claudeSessionId,
          workingDirectory,
          title,
          platform,
          chatId,
          createdAt: now,
          updatedAt: now,
        };
      }
    }

    if (prompt) {
      await this.addMessage(session!.id, 'user', prompt, platform);
    }
    if (responseText) {
      await this.addMessage(session!.id, 'assistant', responseText, platform, costUsd, durationMs);
    }

    return session!.id;
  }

  private async addMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    text: string,
    platform: string,
    costUsd?: number,
    durationMs?: number,
  ): Promise<void> {
    const now = Date.now();
    await pool.query(
      `INSERT INTO session_messages (session_id, role, text, platform, cost_usd, duration_ms, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessionId, role, text, platform, costUsd || null, durationMs || null, now],
    );

    const countResult = await pool.query('SELECT COUNT(*) as count FROM session_messages WHERE session_id = $1', [
      sessionId,
    ]);
    const count = parseInt(countResult.rows[0].count, 10);
    if (count > MAX_MESSAGES_PER_SESSION) {
      const excess = count - MAX_MESSAGES_PER_SESSION;
      await pool.query(
        `DELETE FROM session_messages WHERE id IN (
          SELECT id FROM session_messages WHERE session_id = $1 ORDER BY timestamp ASC LIMIT $2
        )`,
        [sessionId, excess],
      );
    }
  }

  async listSessions(botName: string): Promise<SessionRecord[]> {
    const result = await pool.query(
      `SELECT s.*,
        (SELECT text FROM session_messages WHERE session_id = s.id ORDER BY timestamp DESC LIMIT 1) as last_message_preview
       FROM sessions s
       WHERE s.bot_name = $1
       ORDER BY s.updated_at DESC
       LIMIT 100`,
      [botName],
    );

    return result.rows.map((row: any) => this.mapRow(row));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const result = await pool.query('SELECT * FROM sessions WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByChatId(chatId: string): Promise<SessionRecord | null> {
    const result = await pool.query('SELECT * FROM sessions WHERE chat_id = $1', [chatId]);
    if (result.rows.length > 0) return this.mapRow(result.rows[0]);

    const linkResult = await pool.query('SELECT session_id FROM session_links WHERE chat_id = $1', [chatId]);
    if (linkResult.rows.length > 0) return this.getSession(linkResult.rows[0].session_id);

    return null;
  }

  async getMessages(sessionId: string, since?: number): Promise<SessionMessage[]> {
    let sql = 'SELECT * FROM session_messages WHERE session_id = $1';
    const params: any[] = [sessionId];
    if (since) {
      params.push(since);
      sql += ` AND timestamp > $${params.length}`;
    }
    sql += ' ORDER BY timestamp ASC LIMIT 200';

    const result = await pool.query(sql, params);
    return result.rows.map((r: any) => ({
      role: r.role as 'user' | 'assistant',
      text: r.text,
      timestamp: r.timestamp,
      platform: r.platform,
      costUsd: r.cost_usd || undefined,
      durationMs: r.duration_ms || undefined,
    }));
  }

  async getLinks(sessionId: string): Promise<SessionLink[]> {
    const result = await pool.query('SELECT * FROM session_links WHERE session_id = $1', [sessionId]);
    return result.rows.map((r: any) => ({
      chatId: r.chat_id,
      platform: r.platform,
      linkedAt: r.linked_at,
    }));
  }

  async linkChatId(sessionId: string, chatId: string, platform?: string): Promise<string | undefined> {
    const session = await this.getSession(sessionId);
    if (!session) return undefined;

    const resolvedPlatform = platform || SessionRegistry.detectPlatform(chatId);
    const now = Date.now();

    await pool.query(
      `INSERT INTO session_links (session_id, chat_id, platform, linked_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [sessionId, chatId, resolvedPlatform, now],
    );

    await pool.query('UPDATE sessions SET updated_at = $1 WHERE id = $2', [now, sessionId]);

    this.logger.info({ sessionId, chatId, platform: resolvedPlatform }, 'Session linked to new chatId');
    return session.claudeSessionId;
  }

  async renameSession(id: string, newTitle: string): Promise<boolean> {
    const result = await pool.query('UPDATE sessions SET title = $1, updated_at = $2 WHERE id = $3', [
      newTitle,
      Date.now(),
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async deleteSession(id: string): Promise<void> {
    await pool.query('DELETE FROM session_messages WHERE session_id = $1', [id]);
    await pool.query('DELETE FROM session_links WHERE session_id = $1', [id]);
    await pool.query('DELETE FROM sessions WHERE id = $1', [id]);
  }

  close(): void {
    this.logger.info('Session registry closed');
  }

  private mapRow(row: any): SessionRecord {
    return {
      id: row.id,
      botName: row.bot_name,
      claudeSessionId: row.claude_session_id || undefined,
      workingDirectory: row.working_directory,
      title: row.title,
      platform: row.platform,
      chatId: row.chat_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessagePreview: row.last_message_preview || undefined,
    };
  }
}
