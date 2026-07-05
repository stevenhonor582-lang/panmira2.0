import { createHash } from 'node:crypto';
import { pool } from '../db/index.js';
import type { Logger } from '../utils/logger.js';

type SyncMessage = {
  role: string;
  content: string;
  externalMsgId: string;
  platform?: string;
  costUsd?: number;
  durationMs?: number;
  sentAt?: string;
};

type SyncBody = {
  externalId: string;
  leadId?: string;
  source: string;
  botName?: string;
  title?: string;
  panmiraSource?: string;
  messages: SyncMessage[];
};

function msgId(externalId: string, role: string, content: string): string {
  const h = createHash('sha256').update(content).digest('hex').slice(0, 12);
  return `${externalId}:${role}:${h}`;
}

// 每对话回合调用:查 session + leadBinding → 组 payload → 写 outbox。绝不抛。
export async function syncTurn(args: {
  botName: string;
  chatId: string;
  prompt: string;
  responseText: string | undefined;
  claudeSessionId: string | undefined;
  costUsd?: number;
  durationMs?: number;
  logger: Logger;
}): Promise<void> {
  const { botName, chatId, prompt, responseText, logger } = args;
  try {
    const sessRes = await pool.query(
      'SELECT id, platform FROM sessions WHERE chat_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [chatId],
    );
    const sess = sessRes.rows[0];
    if (!sess) {
      logger.warn({ botName, chatId }, 'nextcrm-sync: no session row, skip');
      return;
    }
    const platform: string = sess.platform || 'web';
    const externalId = `${botName}:${chatId}`; // 一个客户(chatId)= 一个 Conversation
    const panmiraSource = process.env.PANMIRA_SOURCE_NAME || 'mah';

    const leadRes = await pool.query(
      'SELECT lead_id FROM lead_bindings WHERE chat_id = $1 LIMIT 1',
      [chatId],
    );
    const leadId: string | undefined = leadRes.rows[0]?.lead_id;

    const now = Date.now();
    const messages: SyncMessage[] = [
      { role: 'user', content: prompt, externalMsgId: msgId(externalId, 'user', prompt), platform, sentAt: new Date(now).toISOString() },
    ];
    if (responseText) {
      messages.push({
        role: 'assistant',
        content: responseText,
        externalMsgId: msgId(externalId, 'assistant', responseText),
        platform,
        costUsd: args.costUsd,
        durationMs: args.durationMs,
        sentAt: new Date(now).toISOString(),
      });
    }

    const payload: SyncBody = {
      externalId,
      source: platform,
      panmiraSource,
      botName,
      leadId,
      title: prompt.slice(0, 80),
      messages,
    };
    const now2 = Date.now();
    await pool.query(
      `INSERT INTO nextcrm_sync_outbox (payload, status, attempts, created_at, updated_at)
       VALUES ($1, 'pending', 0, $2, $2)`,
      [JSON.stringify(payload), now2],
    );
    logger.info({ externalId, leadId, msgs: messages.length }, 'nextcrm-sync: queued');
  } catch (err) {
    // 铁律:回写失败绝不影响主对话
    logger.warn({ err, botName, chatId }, 'nextcrm-sync: syncTurn failed (swallowed)');
  }
}

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

// 取 pending → POST NextCRM → 标 done 或退避重试。返回成功条数。
export async function flushOutbox(logger: Logger): Promise<number> {
  const url = process.env.NEXTCRM_URL;
  const token = process.env.NEXTCRM_SYNC_TOKEN;
  if (!url || !token) return 0;

  const pending = await pool.query(
    `SELECT id, payload, attempts FROM nextcrm_sync_outbox
     WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= $1)
     ORDER BY id ASC LIMIT 50`,
    [Date.now()],
  );
  let ok = 0;
  for (const row of pending.rows) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/api/conversations/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: token },
        body: JSON.stringify(row.payload),
      });
      if (res.ok) {
        await pool.query(`UPDATE nextcrm_sync_outbox SET status='done', updated_at=$1 WHERE id=$2`, [Date.now(), row.id]);
        ok++;
      } else if (res.status === 401) {
        await pool.query(`UPDATE nextcrm_sync_outbox SET status='failed', last_error='401', updated_at=$1 WHERE id=$2`, [Date.now(), row.id]);
        logger.error({ status: 401 }, 'nextcrm-sync: auth failed, check NEXTCRM_SYNC_TOKEN');
      } else {
        await markRetry(row.id, row.attempts, `http ${res.status}`, logger);
      }
    } catch (err) {
      await markRetry(row.id, row.attempts, String(err), logger);
    }
  }
  return ok;
}

async function markRetry(id: number, attempts: number, err: string, logger: Logger): Promise<void> {
  const nextAttempts = attempts + 1;
  const status = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
  const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts);
  await pool.query(
    `UPDATE nextcrm_sync_outbox SET attempts=$1, last_error=$2, status=$3, next_retry_at=$4, updated_at=$5 WHERE id=$6`,
    [nextAttempts, err.slice(0, 500), status, Date.now() + backoff, Date.now(), id],
  );
  if (status === 'failed') logger.error({ id, err }, 'nextcrm-sync: outbox row failed permanently');
}

export function startNextcrmSyncWorker(logger: Logger): NodeJS.Timeout {
  const intervalMs = Number(process.env.NEXTCRM_SYNC_INTERVAL_MS) || 60_000;
  const tick = () => {
    flushOutbox(logger).catch((e) => logger.warn({ err: e }, 'nextcrm-sync worker tick failed'));
  };
  return setInterval(tick, intervalMs);
}
