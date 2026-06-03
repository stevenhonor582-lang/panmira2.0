import { pool } from './index.js';
import type { VoiceIdentity } from '../api/voice-identity.js';

export class VoiceIdentityDBStore {
  async get(id: string): Promise<VoiceIdentity | null> {
    const r = await pool.query('SELECT * FROM voice_identities WHERE id = $1', [id]);
    return r.rows.length > 0 ? this.mapRow(r.rows[0]) : null;
  }

  async list(): Promise<VoiceIdentity[]> {
    const r = await pool.query('SELECT * FROM voice_identities ORDER BY name');
    return r.rows.map(this.mapRow);
  }

  async upsert(identity: VoiceIdentity): Promise<void> {
    await pool.query(
      `INSERT INTO voice_identities (id, name, phone, registered_at, default_bot_team, permissions, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (id) DO UPDATE SET name = $2, phone = $3, default_bot_team = $5, permissions = $6, updated_at = now()`,
      [identity.id, identity.name, identity.phone ?? null, identity.registeredAt,
       identity.defaultBotTeam ? JSON.stringify(identity.defaultBotTeam) : null,
       identity.permissions ? JSON.stringify(identity.permissions) : null],
    );
  }

  async delete(id: string): Promise<boolean> {
    const r = await pool.query('DELETE FROM voice_identities WHERE id = $1', [id]);
    return (r.rowCount ?? 0) > 0;
  }

  async seedFromJson(data: any): Promise<number> {
    let count = 0;
    for (const i of data.identities || []) {
      await this.upsert(i);
      count++;
    }
    return count;
  }

  private mapRow(r: any): VoiceIdentity {
    return {
      id: r.id,
      name: r.name,
      phone: r.phone ?? undefined,
      registeredAt: Number(r.registered_at),
      defaultBotTeam: r.default_bot_team ?? undefined,
      permissions: r.permissions ?? undefined,
    };
  }
}
