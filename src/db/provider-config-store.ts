import * as crypto from 'node:crypto';
import { pool } from './index.js';
import { encrypt, decrypt } from './crypto.js';
// R16-1 (2026-07-08): context_window support added throughout create/update/mapRow.

export interface ProviderConfig {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKeyEncrypted: string | null;
  model: string;
  contextWindow: number | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ProviderConfigStore {
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL DEFAULT 'openai',
        base_url TEXT NOT NULL DEFAULT '',
        api_key_encrypted TEXT,
        model TEXT NOT NULL DEFAULT '',
        context_window INTEGER,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Ensure context_window column exists (added 2026-07-08 R16-1)
    try {
      await pool.query(`ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS context_window INTEGER`);
    } catch {
      /* ignore — column may already exist */
    }
    this.initialized = true;
  }

  async list(): Promise<ProviderConfig[]> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM provider_configs ORDER BY name');
    return rows.map(this.mapRow);
  }

  async findById(id: string): Promise<ProviderConfig | null> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM provider_configs WHERE id = $1', [id]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async findByName(name: string): Promise<ProviderConfig | null> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM provider_configs WHERE name = $1', [name]);
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async getDefault(): Promise<ProviderConfig | null> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM provider_configs WHERE is_default = true LIMIT 1');
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async create(data: {
    name: string;
    type: string;
    baseUrl: string;
    apiKey?: string;
    model: string;
    contextWindow?: number | null;
    isDefault?: boolean;
  }): Promise<ProviderConfig> {
    await this.init();
    const id = crypto.randomUUID();
    const apiKeyEncrypted = data.apiKey ? encrypt(data.apiKey) : null;

    if (data.isDefault) {
      await pool.query('UPDATE provider_configs SET is_default = false WHERE is_default = true');
    }

    const { rows } = await pool.query(
      `INSERT INTO provider_configs (id, name, type, base_url, api_key_encrypted, model, context_window, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id,
        data.name,
        data.type,
        data.baseUrl,
        apiKeyEncrypted,
        data.model,
        data.contextWindow ?? null,
        data.isDefault ?? false,
      ],
    );
    return this.mapRow(rows[0]);
  }

  async update(
    id: string,
    data: {
      name?: string;
      type?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
      contextWindow?: number | null;
      isDefault?: boolean;
    },
  ): Promise<ProviderConfig | null> {
    await this.init();

    if (data.isDefault) {
      await pool.query('UPDATE provider_configs SET is_default = false WHERE is_default = true');
    }

    const sets: string[] = ['updated_at = now()'];
    const params: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(data.name);
    }
    if (data.type !== undefined) {
      sets.push(`type = $${idx++}`);
      params.push(data.type);
    }
    if (data.baseUrl !== undefined) {
      sets.push(`base_url = $${idx++}`);
      params.push(data.baseUrl);
    }
    if (data.apiKey !== undefined) {
      sets.push(`api_key_encrypted = $${idx++}`);
      params.push(data.apiKey ? encrypt(data.apiKey) : null);
    }
    if (data.model !== undefined) {
      sets.push(`model = $${idx++}`);
      params.push(data.model);
    }
    if (data.contextWindow !== undefined) {
      sets.push(`context_window = $${idx++}`);
      params.push(data.contextWindow);
    }
    if (data.isDefault !== undefined) {
      sets.push(`is_default = $${idx++}`);
      params.push(data.isDefault);
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE provider_configs SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );
    return rows[0] ? this.mapRow(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    const result = await pool.query('DELETE FROM provider_configs WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async getDecryptedApiKey(id: string): Promise<string | null> {
    await this.init();
    const { rows } = await pool.query('SELECT api_key_encrypted FROM provider_configs WHERE id = $1', [id]);
    if (!rows[0]?.api_key_encrypted) return null;
    return decrypt(rows[0].api_key_encrypted);
  }

  /**
   * Safe list — does NOT return decrypted api key.
   * Returns hasApiKey boolean + masked tail instead.
   */
  async listSafe(): Promise<Array<Omit<ProviderConfig, 'apiKeyEncrypted'> & { hasApiKey: boolean; apiKeyMasked: string | null }>> {
    await this.init();
    const { rows } = await pool.query('SELECT * FROM provider_configs ORDER BY name');
    return rows.map((r: any) => {
      const mapped = this.mapRow(r);
      const { apiKeyEncrypted, ...rest } = mapped;
      let maskedTail = '';
      try { maskedTail = r.api_key_encrypted ? decrypt(r.api_key_encrypted).slice(-4) : ''; } catch { /* ignore */ }
      return {
        ...rest,
        hasApiKey: !!r.api_key_encrypted,
        apiKeyMasked: r.api_key_encrypted ? '••••••' + maskedTail : null,
      };
    });
  }

  /**
   * Count agents currently pointing at this provider (via model_id FK).
   */
  async countAgentsUsing(id: string): Promise<number> {
    await this.init();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM agents WHERE model_id = $1', [id]);
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Delete only if no agents reference this provider. Returns {deleted, inUse, agentCount}.
   */
  async deleteIfNotInUse(id: string): Promise<{ deleted: boolean; inUse: boolean; agentCount: number }> {
    const agentCount = await this.countAgentsUsing(id);
    if (agentCount > 0) return { deleted: false, inUse: true, agentCount };
    const deleted = await this.delete(id);
    return { deleted, inUse: false, agentCount: 0 };
  }

  private mapRow(r: any): ProviderConfig {
    return {
      id: r.id,
      name: r.name,
      type: r.type,
      baseUrl: r.base_url,
      apiKeyEncrypted: r.api_key_encrypted ? decrypt(r.api_key_encrypted) : null,
      model: r.model,
      contextWindow: r.context_window ?? null,
      isDefault: r.is_default,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}
