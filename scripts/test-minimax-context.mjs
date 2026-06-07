// scripts/test-minimax-context.mjs
// 精测 MiniMax M-series 单次 messages input 上限
// 锁变量: max_tokens=1, 单条 user message, 无 system/history
// 用随机 hex (每请求唯一) 防止 prompt cache 干扰
//
// 用法: node scripts/test-minimax-context.mjs [--model MiniMax-M3] [--key <sk-...>]
//       或: set MINIMAX_API_KEY=sk-... && node scripts/test-minimax-context.mjs

import { randomBytes as randomBytesFn } from 'node:crypto';

const args = new Map(process.argv.slice(2).map(a => a.startsWith('--') ? [a.slice(2).split('=')[0], a.includes('=') ? a.split('=')[1] : true] : null).filter(Boolean));
const MODEL = args.get('model') || process.env.MINIMAX_MODEL || 'MiniMax-M3';
const API_KEY = args.get('key') || process.env.MINIMAX_API_KEY;
const ENDPOINT = args.get('endpoint') || process.env.MINIMAX_ENDPOINT || 'https://api.minimaxi.com/anthropic/v1/messages';

if (!API_KEY) {
  console.error('ERROR: provide --key <sk-...> or set MINIMAX_API_KEY env');
  process.exit(1);
}

async function probe(targetTokens) {
  // 0.575 tokens/char 是经验值 (MiniMax tokenizer for random hex)
  const chars = Math.ceil(targetTokens / 0.575) * 1.02;
  const content = randomBytesFn(Math.ceil(chars / 2)).toString('hex');
  const body = { model: MODEL, max_tokens: 1, messages: [{ role: 'user', content }] };

  const t0 = Date.now();
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const dt = Date.now() - t0;
  const j = await res.json().catch(() => ({}));
  if (res.ok) {
    const u = j.usage ?? {};
    const total = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    return { ok: true, total, inputTokens: u.input_tokens, ms: dt };
  }
  return { ok: false, err: (j.error?.message ?? '').slice(0, 150), status: res.status, ms: dt };
}

const points = [100_000, 200_000, 300_000, 400_000, 500_000, 510_000, 515_000, 520_000, 525_000, 550_000, 600_000, 800_000, 1_000_000];

console.log(`Endpoint: ${ENDPOINT}`);
console.log(`Model:    ${MODEL}\n`);
console.log('target   | actual_tokens | result   | ms');
console.log('---------+---------------+----------+------');

let lastOk = null, firstFail = null;
for (const t of points) {
  const r = await probe(t);
  if (r.ok) {
    console.log(`${String(t).padStart(7)}  | ${String(r.total).padStart(13)} | OK       | ${r.ms}`);
    lastOk = r;
  } else {
    console.log(`${String(t).padStart(7)}  | FAILED        | ${r.err} | status ${r.status} | ${r.ms}ms`);
    if (!firstFail) firstFail = { target: t, ...r };
  }
}

console.log('\n=== Summary ===');
if (lastOk) console.log(`Last OK:    input_tokens ≈ ${lastOk.total}`);
if (firstFail) console.log(`First FAIL: target ${firstFail.target} (would be ~${firstFail.target} tokens)`);
console.log('\n=> set context window slightly below first fail, e.g. lastOk.total - 10K safety margin');
process.exit(0);
