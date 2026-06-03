import { pool } from './index.js';

export interface DiscoveredGroup {
  chatId: string;
  chatName: string;
  botName: string;
  lastSeen: Date;
}

export class DiscoveredGroupStore {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discovered_groups (
        chat_id TEXT PRIMARY KEY,
        chat_name TEXT NOT NULL DEFAULT '',
        bot_name TEXT NOT NULL DEFAULT '',
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discovered_group_bots (
        chat_id TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (chat_id, bot_name)
      )
    `);
    this.initialized = true;
  }

  async upsert(chatId: string, botName: string): Promise<void> {
    await this.init();
    await pool.query(
      `INSERT INTO discovered_groups (chat_id, bot_name, last_seen)
       VALUES ($1, $2, now())
       ON CONFLICT (chat_id) DO UPDATE SET
         bot_name = $2,
         last_seen = now()`,
      [chatId, botName],
    );
    await pool.query(
      `INSERT INTO discovered_group_bots (chat_id, bot_name, last_seen)
       VALUES ($1, $2, now())
       ON CONFLICT (chat_id, bot_name) DO UPDATE SET
         last_seen = now()`,
      [chatId, botName],
    );
  }

  async updateName(chatId: string, chatName: string): Promise<void> {
    await this.init();
    await pool.query('UPDATE discovered_groups SET chat_name = $1 WHERE chat_id = $2', [chatName, chatId]);
  }

  async list(): Promise<DiscoveredGroup[]> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM discovered_groups ORDER BY last_seen DESC');
    return rows.map((r: any) => ({
      chatId: r.chat_id,
      chatName: r.chat_name || '',
      botName: r.bot_name,
      lastSeen: r.last_seen,
    }));
  }

  async listBotsForGroup(chatId: string): Promise<string[]> {
    await this.init();
    const { rows } = await pool.query(
      'SELECT bot_name FROM discovered_group_bots WHERE chat_id = $1 ORDER BY last_seen DESC',
      [chatId],
    );
    return rows.map((r: any) => r.bot_name);
  }
}
