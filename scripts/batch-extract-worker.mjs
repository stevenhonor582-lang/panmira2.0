// scripts/batch-extract-worker.mjs
// 2026-06-27 commit 4: 真正的 batch extraction worker
// 之前 extraction-worker.mjs 只是健康检查, 不实际抽取
// 修复 B11 (实际抽取), B12 (auto-restart), B13 (飞书告警)

import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { pool } = await import('../dist/db/index.js');
const { MemoryExtractor } = await import('../dist/bridge/memory-extractor.js');

const ALERT_LOG = join(__dirname, '..', 'logs', 'extraction-alerts.log');
const HEALTH_LOG = join(__dirname, '..', 'logs', 'extraction-health.log');
const PANMIRA_WEBHOOK = process.env.PANMIRA_ALERT_WEBHOOK || '';

let alertCount = 0;

function alert(severity, msg, sendFeishu = true) {
  const line = `[${new Date().toISOString()}] ${severity}: ${msg}`;
  console.log(line);
  alertCount++;
  try { appendFileSync(ALERT_LOG, line + '\n'); } catch {}
  if (sendFeishu && PANMIRA_WEBHOOK) {
    sendFeishuAlert(`[${severity}] ${msg}`).catch(() => {});
  }
}

function health(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { appendFileSync(HEALTH_LOG, line + '\n'); } catch {}
}

async function sendFeishuAlert(msg) {
  if (!PANMIRA_WEBHOOK) return;
  await fetch(PANMIRA_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msg_type: 'text', content: { text: msg } }),
  });
}

async function main() {
  health('=== Batch Extract Worker (6h window) ===');
  health(`Time: ${new Date().toISOString()}`);

  // 1. 查 6h 内 activity 按 bot 分组
  const actRes = await pool.query(`
    SELECT bot_name, COUNT(*) AS cnt
    FROM activity_events
    WHERE timestamp > (EXTRACT(epoch FROM NOW()) - 21600) * 1000
    GROUP BY bot_name
    ORDER BY cnt DESC
  `);
  const botStats = actRes.rows;
  health(`Found ${botStats.length} bots with activity in 6h`);

  let totalExtracted = 0;
  let totalFailed = 0;

  for (const { bot_name, cnt } of botStats) {
    if (cnt < 5) {
      health(`  ${bot_name}: ${cnt} activities (skip, < 5)`);
      continue;
    }
    health(`  ${bot_name}: ${cnt} activities, processing...`);

    // 2. 拉取 chat turn
    const chatRes = await pool.query(`
      SELECT
        user_id,
        user_message,
        assistant_response,
        metadata_json->>'chatId' AS chat_id
      FROM activity_events
      WHERE bot_name = $1
        AND timestamp > (EXTRACT(epoch FROM NOW()) - 21600) * 1000
        AND user_message IS NOT NULL
        AND assistant_response IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 50
    `, [bot_name]);

    if (chatRes.rows.length === 0) {
      health(`    no chat turns to process`);
      continue;
    }

    // 3. 调 LLM 抽取
    const extractor = new MemoryExtractor();
    let extracted = 0;
    let failed = 0;

    for (const turn of chatRes.rows) {
      try {
        const windowText = `User: ${turn.user_message}\nAssistant: ${turn.assistant_response}\n---\n`;
        const botIdRes = await pool.query('SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1', [bot_name]);
        if (botIdRes.rows.length === 0) continue;
        const botId = botIdRes.rows[0].bot_id;

        const candidates = await extractor.extract(windowText, botId, turn.chat_id || 'unknown', 1);

        for (const cand of candidates) {
          try {
            const layerByType = { event: 1, fact: 2, entity: 2, preference: 2, decision: 3 };
            const layer = layerByType[cand.type] || 1;

            await pool.query(`
              INSERT INTO memories (id, content, layer, user_id, bot_id, tenant_id, importance,
                embedding, metadata_json, subject, subject_normalized, confidence, hit_count, type, polarity)
              VALUES (gen_random_uuid()::text, $1, $10, $2, $3::uuid, $11, $4,
                NULL, $5::jsonb, $6, $7, $8, 0, $9, $12)
              ON CONFLICT (bot_id, subject_normalized) WHERE invalidated_at IS NULL
              DO UPDATE SET
                content = EXCLUDED.content,
                confidence = GREATEST(memories.confidence, EXCLUDED.confidence),
                hit_count = memories.hit_count + 1,
                last_hit_at = NOW(),
                updated_at = NOW()
            `, [
              cand.content,
              turn.user_id,
              botId,
              cand.confidence,
              JSON.stringify({ source: 'batch-extract', chat_id: turn.chat_id, extracted_at: new Date().toISOString() }),
              cand.subject, cand.subject_normalized, cand.confidence, cand.type, layer,
              `batch:${bot_name}`, cand.polarity || 'affirm',
            ]);
            extracted++;
          } catch (e) {
            failed++;
            console.error(`    Failed to insert candidate: ${e.message}`);
          }
        }
      } catch (e) {
        failed++;
        console.error(`    LLM extract failed for turn: ${e.message}`);
      }
    }

    totalExtracted += extracted;
    totalFailed += failed;
    health(`    extracted=${extracted}, failed=${failed}`);
  }

  // 4. 健康度检查
  const recentMem = await pool.query(`
    SELECT COUNT(*) AS cnt FROM memories
    WHERE created_at > NOW() - INTERVAL '6 hours' AND invalidated_at IS NULL
  `);

  if (Number(recentMem.rows[0].cnt) === 0 && botStats.length > 0) {
    const totalActs = botStats.reduce((s, b) => s + Number(b.cnt), 0);
    alert('CRITICAL', `Batch extract failed: 0 memories written but ${totalActs} activities in 6h. Auto-restarting panmira.`);

    // 5. 自动重启
    try {
      health('Auto-restarting panmira...');
      execSync('pm2 restart panmira', { stdio: 'inherit' });
      alert('INFO', 'panmira restarted successfully');
    } catch (e) {
      alert('CRITICAL', `Auto-restart failed: ${e.message}. Manual intervention required.`);
    }
  }

  health(`\n=== Summary ===`);
  health(`Total extracted: ${totalExtracted}`);
  health(`Total failed: ${totalFailed}`);
  health(`Status: ${alertCount === 0 ? 'HEALTHY' : `${alertCount} alerts`}`);

  await pool.end();
  process.exit(alertCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  alert('FATAL', `batch-extract-worker crashed: ${err.message}`);
  process.exit(1);
});
