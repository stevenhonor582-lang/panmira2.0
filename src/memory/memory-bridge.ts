// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPool = { query: (...args: any[]) => Promise<any> };

export interface MemoryBridgeCtx {
  chatId: string;
  botName: string;
  sceneType: string;
}

export class MemoryBridge {
  constructor(private opts: { pool: AnyPool }) {}

  async writeStageOutput(
    ctx: MemoryBridgeCtx,
    stage: string,
    output: unknown,
  ): Promise<void> {
    const content = `[${stage}] ${JSON.stringify(output).slice(0, 500)}`;
    const metadataJson = JSON.stringify({
      source: 'team-pipeline',
      chat_id: ctx.chatId,
      stage,
      scene_type: ctx.sceneType,
    });
    const subject = `${ctx.sceneType}/${stage}`;
    await this.opts.pool.query(
      `INSERT INTO memories (id, content, layer, user_id, bot_id, tenant_id, importance,
         metadata_json, subject, subject_normalized, confidence, hit_count, type, polarity)
       SELECT gen_random_uuid()::text, $1, 2, $2, bc.bot_id, 'tenant-default', 5,
         $3::jsonb, $4, $4, 0.8, 0, 'fact', 'affirm'
       FROM bot_configs bc WHERE bc.name = $5 LIMIT 1`,
      [content, 'team-pipeline', metadataJson, subject, ctx.botName],
    );
  }

  async readMemories(
    ctx: { botName: string; sceneType: string },
    sceneType: string,
    limit: number,
  ): Promise<Array<{ id: string; content: string; metadata_json: unknown }>> {
    const r = await this.opts.pool.query(
      `SELECT m.id, m.content, m.metadata_json
       FROM memories m
       JOIN bot_configs bc ON m.bot_id = bc.bot_id
       WHERE bc.name = $1
         AND m.metadata_json->>'scene_type' = $2
         AND m.invalidated_at IS NULL
       ORDER BY m.created_at DESC LIMIT $3`,
      [ctx.botName, sceneType, limit],
    );
    return r.rows;
  }
}
