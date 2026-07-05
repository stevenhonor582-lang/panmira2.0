type AnyPool = { query: (...args: any[]) => Promise<any> };

export interface EngineConfigData {
  name: string;
  baseUrl: string;
  apiKey: string;
  type: string;
}

export class EngineConfig {
  constructor(public data: EngineConfigData) {}

  get apiKey() { return this.data.apiKey; }
  get baseUrl() { return this.data.baseUrl; }
  get name() { return this.data.name; }

  static async fromName(name: string, deps: { pool: AnyPool }): Promise<EngineConfig> {
    const r = await deps.pool.query(
      `SELECT name, endpoint, api_key, type FROM provider_configs WHERE name = $1 LIMIT 1`,
      [name],
    );
    if (r.rows.length === 0) throw new Error(`Engine not found: ${name}`);
    const row = r.rows[0];
    return new EngineConfig({ name: row.name, baseUrl: row.endpoint, apiKey: row.api_key, type: row.type });
  }

  static async fromBot(botName: string, deps: { pool: AnyPool }): Promise<EngineConfig> {
    const r = await deps.pool.query(
      `SELECT a.engine FROM bot_configs bc
       JOIN bot_agent_history bah ON bah.bot_id = bc.bot_id
       JOIN agents a ON bah.agent_id = a.id
       WHERE bc.name = $1
       ORDER BY bah.bound_at DESC LIMIT 1`,
      [botName],
    );
    if (r.rows.length === 0) throw new Error(`Bot not found: ${botName}`);
    return EngineConfig.fromName(r.rows[0].engine, deps);
  }
}
