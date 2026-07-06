// scripts/monitor-extraction.mjs (v2)
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { pool } = await import('../dist/db/index.js');

const ALERT_LOG = join(__dirname, '..', 'logs', 'monitor-alerts.log');

let alertCount = 0;
const alerts = [];

function alert(severity, msg) {
  const line = `[${new Date().toISOString()}] ${severity}: ${msg}`;
  alerts.push(line);
  alertCount++;
  console.log(line);
  try { appendFileSync(ALERT_LOG, line + '\n'); } catch {}
}

async function check(name, fn) {
  try {
    const result = await fn();
    console.log(`  OK ${name}: ${result}`);
    return { ok: true, value: result };
  } catch (err) {
    alert('WARN', `${name}: ${err.message}`);
    return { ok: false };
  }
}

async function main() {
  console.log('=== Memory System Monitor ===');
  console.log('Time:', new Date().toISOString());

  await check('DB connection', async () => {
    const r = await pool.query('SELECT 1 AS ok');
    return r.rows[0].ok === 1 ? 'connected' : 'unexpected';
  });

  await check('Memories count', async () => {
    const r = await pool.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE invalidated_at IS NULL) AS active FROM memories');
    return `${r.rows[0].active}/${r.rows[0].total} active/total`;
  });

  await check('Memory embedding coverage', async () => {
    const r = await pool.query('SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL)::float / GREATEST(COUNT(*), 1) * 100 AS pct FROM memories WHERE invalidated_at IS NULL');
    return `${parseFloat(r.rows[0].pct).toFixed(1)}%`;
  });

  await check('Memories written last hour', async () => {
    const r = await pool.query("SELECT COUNT(*) AS cnt FROM memories WHERE created_at > NOW() - INTERVAL '1 hour'");
    return `${r.rows[0].cnt} new`;
  });

  await check('Documents count', async () => {
    const r = await pool.query('SELECT COUNT(*) AS cnt FROM documents');
    return `${r.rows[0].cnt} total`;
  });

  await check('Document embedding coverage', async () => {
    const r = await pool.query('SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL)::float / GREATEST(COUNT(*), 1) * 100 AS pct FROM documents');
    return `${parseFloat(r.rows[0].pct).toFixed(1)}%`;
  });

  await check('Bot configs', async () => {
    const r = await pool.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_active) AS active FROM bot_configs');
    return `${r.rows[0].active}/${r.rows[0].total} active/total`;
  });

  await check('Migrations applied', async () => {
    const r = await pool.query("SELECT COUNT(*) AS cnt FROM _migration_log WHERE migration_name LIKE 'V%'");
    return `${r.rows[0].cnt} V-* migrations`;
  });

  // 2026-06-27 commit 5: 监控 RAG topScore 趋势
  await check('RAG topScore P50 last 1h', async () => {
    const r = await pool.query(`
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY top_score) AS p50
      FROM rag_query_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND top_score IS NOT NULL
    `);
    const p50 = parseFloat(r.rows[0]?.p50 || 0);
    if (p50 < 0.5) {
      alert('WARN', `RAG topScore P50 < 0.5 (${p50.toFixed(3)}) - RAG 召回质量下降`);
    }
    return `P50=${p50.toFixed(3)}`;
  });

  await check('RAG queries count last 1h', async () => {
    const r = await pool.query(`
      SELECT COUNT(*) AS n FROM rag_query_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);
    return `${r.rows[0].n} queries`;
  });

  await check('RAG extraction failures last 1h', async () => {
    const r = await pool.query(`
      SELECT COUNT(*) AS n FROM rag_query_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND extraction_status = 'failed'
    `);
    const n = Number(r.rows[0].n);
    if (n > 5) {
      alert('WARN', `${n} RAG extraction failures in last 1h`);
    }
    return `${n} failures`;
  });

  await check('Memory layer distribution', async () => {
    const r = await pool.query('SELECT layer, COUNT(*) AS cnt FROM memories WHERE invalidated_at IS NULL GROUP BY layer ORDER BY layer');
    return r.rows.map(row => `L${row.layer}:${row.cnt}`).join(', ') || 'empty';
  });

  await check('Memory type distribution', async () => {
    const r = await pool.query("SELECT type, COUNT(*) AS cnt FROM memories WHERE invalidated_at IS NULL GROUP BY type ORDER BY cnt DESC LIMIT 5");
    return r.rows.map(row => `${row.type}:${row.cnt}`).join(', ');
  });

  await check('Duplicate memories', async () => {
    const r = await pool.query(`
      SELECT COUNT(*) - COUNT(DISTINCT (bot_id, subject_normalized)) AS dups
      FROM memories WHERE invalidated_at IS NULL
    `);
    return `${r.rows[0].dups} duplicates (should be 0)`;
  });

  await check('CHECK constraints active', async () => {
    const r = await pool.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'memories'::regclass AND contype = 'c'
        AND conname IN ('memories_layer_check', 'memories_type_check', 'memories_polarity_check')
    `);
    return `${r.rows.length}/3 active`;
  });

  console.log('\n=== Summary ===');
  if (alertCount === 0) {
    console.log('Status: HEALTHY (0 alerts)');
  } else {
    console.log(`Status: ${alertCount} alerts - check ${ALERT_LOG}`);
  }

  await pool.end();
  process.exit(alertCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});