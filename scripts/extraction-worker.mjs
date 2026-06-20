// scripts/extraction-worker.mjs
// 6h-window extraction health check + sync verification
// Runs as PM2 cron (every 6 hours)
//
// Purpose: complement the hourly monitor-extraction with deeper checks.
// Without persisted chat messages, real LLM-based extraction can't be done
// in batch — but we can verify the extraction pipeline is healthy and
// detect anomalies (e.g., high activity + zero memories = pipeline broken).

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
const ALERT_LOG = join(__dirname, '..', 'logs', 'extraction-alerts.log');

let alertCount = 0;
function alert(severity, msg) {
  const line = `[${new Date().toISOString()}] ${severity}: ${msg}`;
  console.log(line);
  alertCount++;
  try { appendFileSync(ALERT_LOG, line + '\\n'); } catch {}
}

async function main() {
  console.log('=== Extraction Worker (6h window) ===');
  console.log('Time:', new Date().toISOString());

  const recentMemRes = await pool.query(`
    SELECT
      COUNT(*) AS cnt,
      COUNT(*) FILTER (WHERE type = 'decision') AS decisions,
      COUNT(*) FILTER (WHERE type = 'fact') AS facts,
      COUNT(*) FILTER (WHERE type = 'entity') AS entities
    FROM memories
    WHERE created_at > NOW() - INTERVAL '6 hours'
      AND invalidated_at IS NULL
  `);
  const recent = recentMemRes.rows[0];
  console.log(`  Memories written in 6h: ${recent.cnt} (decision:${recent.decisions}, fact:${recent.facts}, entity:${recent.entities})`);

  const actRes = await pool.query(`
    SELECT COUNT(*) AS cnt, COUNT(DISTINCT bot_name) AS bots
    FROM activity_events
    WHERE timestamp > (EXTRACT(epoch FROM NOW()) - 21600) * 1000
  `);
  const activity = actRes.rows[0];
  console.log(`  Activities in 6h: ${activity.cnt} (across ${activity.bots} bots)`);

  if (parseInt(activity.cnt) > 10 && parseInt(recent.cnt) === 0) {
    alert('CRITICAL', `Extraction pipeline may be broken: ${activity.cnt} activities but 0 memories in 6h`);
  }

  const layerRes = await pool.query(`
    SELECT layer, COUNT(*) AS cnt FROM memories
    WHERE invalidated_at IS NULL
    GROUP BY layer ORDER BY layer
  `);
  const layerDist = layerRes.rows.map(r => 'L' + r.layer + ':' + r.cnt).join(', ');
  console.log(`  Layer distribution: ${layerDist}`);

  const anomalyRes = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE tenant_id = 'default' AND invalidated_at IS NULL) AS default_active,
      COUNT(*) FILTER (WHERE layer NOT BETWEEN 1 AND 3) AS bad_layer,
      COUNT(*) FILTER (WHERE type NOT IN ('event', 'fact', 'entity', 'preference', 'decision')) AS bad_type
    FROM memories
  `);
  const anomaly = anomalyRes.rows[0];
  console.log(`  Anomalies: default=${anomaly.default_active}, bad_layer=${anomaly.bad_layer}, bad_type=${anomaly.bad_type}`);
  if (parseInt(anomaly.default_active) > 0 || parseInt(anomaly.bad_layer) > 0 || parseInt(anomaly.bad_type) > 0) {
    alert('WARN', 'Schema anomalies: ' + JSON.stringify(anomaly));
  }

  const dupRes = await pool.query(`
    SELECT COUNT(*) AS total_active,
           COUNT(*) - COUNT(DISTINCT (bot_id, subject_normalized)) AS dups
    FROM memories
    WHERE invalidated_at IS NULL
  `);
  const dup = dupRes.rows[0];
  console.log(`  Duplicates: ${dup.dups} (should be 0)`);
  if (parseInt(dup.dups) > 0) {
    alert('WARN', dup.dups + ' duplicate memories detected (should be 0)');
  }

  console.log('\\n=== Summary ===');
  if (alertCount === 0) {
    console.log('Status: EXTRACTION HEALTHY');
  } else {
    console.log('Status: ' + alertCount + ' alerts - check ' + ALERT_LOG);
  }

  await pool.end();
  process.exit(alertCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
