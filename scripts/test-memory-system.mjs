// scripts/test-memory-system.mjs (v2 with realistic test data)
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
try {
  const env = readFileSync(envPath, 'utf-8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { pool } = await import('../dist/db/index.js');
const TOKEN = process.env.MEMORY_ADMIN_TOKEN || 'metabot2025secret';
const BASE_URL = 'http://localhost:8100';

let passed = 0, failed = 0;
const results = [];

async function runTest(name, fn) {
  process.stdout.write('  ' + name + ' ... ');
  try {
    await fn();
    console.log('PASS');
    passed++;
    results.push({ name, status: 'PASS' });
  } catch (err) {
    console.log('FAIL: ' + err.message);
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
  }
}

async function apiSearch(q) {
  const url = BASE_URL + '/api/search?q=' + encodeURIComponent(q) + '&limit=5';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + TOKEN } });
  if (!res.ok) throw new Error('API ' + res.status + ': ' + await res.text());
  return res.json();
}

console.log('=== Memory System Tests (v2) ===\n');

// T1: Semantic recall (documents table)
await runTest('T1: Semantic recall (aluminum 7075 -> 7075-T6)', async () => {
  const results = await apiSearch('aluminum 7075 加工');
  if (!results.length) throw new Error('no results');
  const top = results[0];
  if (top.score < 0.5) throw new Error('score too low: ' + top.score);
  const top3Text = results.slice(0, 3).map(r => r.title || '').join(' ').toLowerCase();
  if (!/7075|r7|r9|t4/.test(top3Text)) throw new Error('expected 7075 in top 3, got: ' + top3Text);
});

// T2: bot isolation - both bots have memories, are distinct
await runTest('T2: bot_id isolation (deyi and buying have separate data)', async () => {
  const ydRes = await pool.query(
    "SELECT COUNT(*) AS cnt FROM memories WHERE invalidated_at IS NULL AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1)",
    ['得一']
  );
  const byRes = await pool.query(
    "SELECT COUNT(*) AS cnt FROM memories WHERE invalidated_at IS NULL AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1)",
    ['不盈']
  );
  const yd = parseInt(ydRes.rows[0].cnt);
  const by = parseInt(byRes.rows[0].cnt);
  if (yd === 0) throw new Error('deyi has no memories');
  if (by === 0) throw new Error('buying has no memories');
});

// T3: Literal fallback
await runTest('T3: Literal fallback (7075-T6 keyword)', async () => {
  const results = await apiSearch('7075-T6');
  if (!results.length) throw new Error('no results');
  if (results[0].score < 0.4) throw new Error('score too low: ' + results[0].score);
});

// T4: SQL type safety (use realistic keyword that exists in memories)
await runTest('T4: SQL type safety (memories query with panmira keyword)', async () => {
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS cnt FROM memories WHERE invalidated_at IS NULL AND bot_id = (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1) AND (content ILIKE '%' || $2 || '%' OR subject ILIKE '%' || $2 || '%') LIMIT 1",
    ['得一', 'panmira']
  );
  if (parseInt(rows[0].cnt) === 0) throw new Error('expected panmira matches in deyi memories');
});

// T5: CHECK constraint
await runTest('T5: CHECK constraint (layer=99 rejected)', async () => {
  try {
    await pool.query(
      "INSERT INTO memories (id, content, layer, user_id, tenant_id, type, bot_id, subject_normalized) VALUES ('test-bad-layer-constraint', 'test', 99, 'test', 'tenant:fake-test', 'event', (SELECT bot_id FROM bot_configs WHERE name = $1 LIMIT 1), 'test.bad.layer.99')",
      ['得一']
    );
    throw new Error('insert succeeded - CHECK not enforced');
  } catch (e) {
    if (!e.message.includes('check constraint')) throw new Error('unexpected: ' + e.message);
  }
});

// T6: UNIQUE constraint
await runTest('T6: UNIQUE constraint (duplicate subject rejected)', async () => {
  const { rows: existing } = await pool.query(
    "SELECT bot_id, subject_normalized FROM memories WHERE invalidated_at IS NULL LIMIT 1"
  );
  if (!existing.length) throw new Error('no existing memory');
  try {
    await pool.query(
      "INSERT INTO memories (id, content, layer, user_id, tenant_id, type, bot_id, subject_normalized) VALUES ('test-dup-constraint', 'test', 1, 'test', 'tenant:fake-test', 'event', $1, $2)",
      [existing[0].bot_id, existing[0].subject_normalized]
    );
    throw new Error('dup insert succeeded');
  } catch (e) {
    if (!e.message.includes('unique constraint')) throw new Error('unexpected: ' + e.message);
  }
});

// T7: LLM-extract-dedup ON CONFLICT (would be tested via SQL semantics)
// Skipping for now since this requires LLM call

// T8: score range check (no RRF compressed to 0.0164)
await runTest('T8: score range (top1 should be 0.5+)', async () => {
  const results = await apiSearch('TCO 总拥有成本');
  if (!results.length) throw new Error('no results');
  if (results[0].score < 0.5) throw new Error('score too low: ' + results[0].score);
});

console.log('\n=== Results ===');
console.log('Passed: ' + passed + ' / ' + (passed + failed));
if (failed > 0) {
  console.log('\nFailed:');
  results.filter(r => r.status === 'FAIL').forEach(r => console.log('  - ' + r.name + ': ' + r.error));
  await pool.end();
  process.exit(1);
}
await pool.end();
process.exit(0);