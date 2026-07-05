// scripts/probe-context-window.mjs
// 工单 9 (2026-07-06): 通用 provider contextWindow 测量脚本
// 用法:node scripts/probe-context-window.mjs [--provider minimax] [--model MiniMax-M3] [--base https://...] [--key sk-...]
//   --update-db: 测量完自动更新 provider_configs.context_window

import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

const args = new Map(process.argv.slice(2).map(a =>
  a.startsWith('--') ? [a.slice(2).split('=')[0], a.includes('=') ? a.split('=')[1] : true] : null
).filter(Boolean));

const PROVIDER = args.get('provider') || process.env.PROVIDER || 'minimax';
const MODEL = args.get('model') || process.env.MODEL || 'MiniMax-M3';
const API_KEY = args.get('key') || process.env.API_KEY;
const BASE_URL = args.get('base') || process.env.BASE_URL || 'https://api.minimaxi.com/anthropic/v1/messages';
const UPDATE_DB = args.has('update-db');
const DB_URL = process.env.DATABASE_URL || 'postgresql://ubuntu:ubuntu@localhost:5432/metabot';

// 二分搜索 OK 的最大 token 数
async function probe(targetTokens) {
  const chars = Math.ceil(targetTokens / 0.575) * 1.02;
  const content = randomBytes(Math.ceil(chars / 2)).toString('hex');
  const body = { model: MODEL, max_tokens: 1, messages: [{ role: 'user', content }] };
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, err };
  }
  return { ok: true };
}

async function measureContextWindow() {
  // 测试点(覆盖常用区间)
  const testPoints = [10000, 50000, 100000, 200000, 300000, 500000, 800000, 1000000, 1500000, 2000000];

  let maxOk = 0;
  const results = [];

  for (const t of testPoints) {
    const r = await probe(t);
    const tag = r.ok ? 'OK' : `FAIL(${r.status})`;
    console.log(`  ${t.toString().padStart(8)} → ${tag}`);
    results.push({ tokens: t, ...r });
    if (r.ok) maxOk = t;
    else break; // 第一个失败点之后不再测(节省时间)
  }

  // 在最后 OK 和第一个 FAIL 之间二分
  if (maxOk > 0 && maxOk < testPoints[testPoints.length - 1]) {
    let lo = maxOk;
    let hi = testPoints[testPoints.indexOf(maxOk) + 1] || maxOk * 2;
    while (hi - lo > 5000) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await probe(mid);
      console.log(`  binary ${mid} → ${r.ok ? 'OK' : 'FAIL'}`);
      if (r.ok) lo = mid;
      else hi = mid;
    }
    maxOk = lo;
    console.log(`  final: ${maxOk}`);
  }

  return { maxOk, results };
}

if (!API_KEY) {
  console.error('ERROR: provide --key <sk-...> or set API_KEY env');
  process.exit(1);
}

console.log(`=== Measuring context window for ${MODEL} ===`);
console.log(`Endpoint: ${BASE_URL}`);
console.log();

const { maxOk } = await measureContextWindow();

// 推荐 80% 留 20% 安全边距
const safe = Math.floor(maxOk * 0.95);
console.log(`\n=== Result ===`);
console.log(`Max OK tokens: ${maxOk}`);
console.log(`Recommended (95%): ${safe}`);

if (UPDATE_DB) {
  const pool = new Pool({ connectionString: DB_URL });
  const r = await pool.query(
    `UPDATE provider_configs SET context_window = $1 WHERE name = $2 RETURNING name, context_window`,
    [safe, PROVIDER]
  );
  if (r.rows.length === 0) {
    console.log(`\nWARN: provider "${PROVIDER}" not found in DB. Manual insert:`);
    console.log(`INSERT INTO provider_configs (name, type, endpoint, api_key, is_default, context_window) VALUES ('${PROVIDER}', 'anthropic', '${BASE_URL}', '***', false, ${safe});`);
  } else {
    console.log(`\n✓ Updated provider_configs: ${r.rows[0].name} → ${r.rows[0].context_window}`);
  }
  await pool.end();
} else {
  console.log(`\n(no DB update — pass --update-db to apply)`);
}
