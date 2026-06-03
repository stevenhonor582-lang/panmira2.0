import { pool } from './index.js';
import { encrypt, decrypt } from './crypto.js';

export interface BotConfigRow {
  id: string;
  name: string;
  platform: string;
  configJson: Record<string, unknown>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class BotConfigStore {
  async list(): Promise<BotConfigRow[]> {
    const result = await pool.query('SELECT * FROM bot_configs WHERE is_active = true ORDER BY name');
    return result.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      platform: r.platform,
      configJson: typeof r.config_json === 'string' ? JSON.parse(r.config_json) : r.config_json,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async listAll(): Promise<BotConfigRow[]> {
    const result = await pool.query('SELECT * FROM bot_configs ORDER BY name');
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async findByName(name: string): Promise<BotConfigRow | null> {
    const result = await pool.query('SELECT * FROM bot_configs WHERE name = $1', [name]);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      name: r.name,
      platform: r.platform,
      configJson: typeof r.config_json === 'string' ? JSON.parse(r.config_json) : r.config_json,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async create(platform: string, entry: Record<string, unknown>): Promise<BotConfigRow> {
    const name = entry.name as string;
    const result = await pool.query(
      `INSERT INTO bot_configs (name, platform, config_json)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET config_json = $3, platform = $2, updated_at = now()
       RETURNING *`,
      [name, platform, JSON.stringify(entry)],
    );
    const r = result.rows[0];

    // Extract and store secrets
    await this.extractSecrets(name, entry);

    return this.mapRow(r);
  }

  async update(name: string, updates: Record<string, unknown>): Promise<BotConfigRow | null> {
    const existing = await this.findByName(name);
    if (!existing) return null;

    const merged = { ...existing.configJson, ...updates };
    // Remove keys with empty/null/undefined values (match old behavior)
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === null || v === '') delete merged[k];
    }

    const result = await pool.query(
      'UPDATE bot_configs SET config_json = $1, updated_at = now() WHERE name = $2 RETURNING *',
      [JSON.stringify(merged), name],
    );
    if (result.rows.length === 0) return null;

    await this.extractSecrets(name, merged);
    return this.mapRow(result.rows[0]);
  }

  async setActive(name: string, active: boolean): Promise<boolean> {
    const result = await pool.query('UPDATE bot_configs SET is_active = $1, updated_at = now() WHERE name = $2', [
      active,
      name,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async delete(name: string): Promise<boolean> {
    await pool.query('DELETE FROM bot_secrets WHERE bot_name = $1', [name]);
    const result = await pool.query('DELETE FROM bot_configs WHERE name = $1', [name]);
    return (result.rowCount ?? 0) > 0;
  }

  async getSecret(botName: string, keyType: string): Promise<string | null> {
    const result = await pool.query('SELECT encrypted_value FROM bot_secrets WHERE bot_name = $1 AND key_type = $2', [
      botName,
      keyType,
    ]);
    if (result.rows.length === 0) return null;
    return decrypt(result.rows[0].encrypted_value);
  }

  async getAllSecrets(botName: string): Promise<Record<string, string>> {
    const result = await pool.query('SELECT key_type, encrypted_value FROM bot_secrets WHERE bot_name = $1', [botName]);
    const secrets: Record<string, string> = {};
    for (const row of result.rows) {
      secrets[row.key_type] = decrypt(row.encrypted_value);
    }
    return secrets;
  }

  async hasSecret(botName: string, keyType: string): Promise<boolean> {
    const result = await pool.query('SELECT 1 FROM bot_secrets WHERE bot_name = $1 AND key_type = $2', [
      botName,
      keyType,
    ]);
    return result.rows.length > 0;
  }

  async seedFromJson(jsonPath: string): Promise<{ seeded: number; skipped: number }> {
    const fs = await import('node:fs');
    if (!fs.existsSync(jsonPath)) return { seeded: 0, skipped: 0 };

    const raw = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(raw);

    interface BotEntry {
      name: string;
      [k: string]: unknown;
    }
    const platformMap: Record<string, BotEntry[]> = {};
    if (Array.isArray(data)) {
      platformMap.feishu = data;
    } else {
      if (data.feishuBots) platformMap.feishu = data.feishuBots;
      if (data.telegramBots) platformMap.telegram = data.telegramBots;
      if (data.webBots) platformMap.web = data.webBots;
      if (data.wechatBots) platformMap.wechat = data.wechatBots;
    }

    let seeded = 0;
    let skipped = 0;

    for (const [platform, bots] of Object.entries(platformMap)) {
      for (const entry of bots) {
        const name = entry.name as string;
        const existing = await this.findByName(name);
        if (existing) {
          skipped++;
          continue;
        }
        await this.create(platform, entry);
        seeded++;
      }
    }

    return { seeded, skipped };
  }

  private async extractSecrets(botName: string, entry: Record<string, unknown>): Promise<void> {
    const secretMap: Record<string, string> = {
      feishuAppSecret: 'feishu_app_secret',
      openaiApiKey: 'openai_api_key',
      apiKey: 'api_key',
      telegramBotToken: 'telegram_bot_token',
      wechatBotToken: 'wechat_bot_token',
    };

    for (const [field, keyType] of Object.entries(secretMap)) {
      const value = entry[field] as string | undefined;
      if (!value) continue;
      // Skip masked placeholders sent by the frontend — they indicate "keep existing"
      if (value.includes('****')) continue;
      const encrypted = encrypt(value);
      await pool.query(
        `INSERT INTO bot_secrets (bot_name, key_type, encrypted_value)
         VALUES ($1, $2, $3)
         ON CONFLICT (bot_name, key_type) DO UPDATE SET encrypted_value = $3, updated_at = now()`,
        [botName, keyType, encrypted],
      );
    }
  }

  private mapRow(r: any): BotConfigRow {
    return {
      id: r.id,
      name: r.name,
      platform: r.platform,
      configJson: typeof r.config_json === 'string' ? JSON.parse(r.config_json) : r.config_json,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
