/**
 * PoC #1: SDK persistSession + SIGINT 恢复行为验证
 *
 * 验证项:
 *   1. query() with persistSession:true 是否真的生成 JSONL
 *   2. 返回的 sdk_session_id 是否可重用
 *   3. SIGINT 后新进程能否继续之前的 session
 *   4. 用 V1 continue 选项 vs V2 resumeSession 对比
 *
 * 运行:
 *   node poc-01-persist-session.mjs step1   # 跑 query + 拿 session_id
 *   node poc-01-persist-session.mjs step2   # 新进程，尝试 resume
 *   node poc-01-persist-session.mjs step3   # 检查 JSONL 文件
 *
 * 注意:
 *   - 用临时 cwd (/tmp/panmira-poc-01) 不影响 panmira 生产
 *   - 不用真 API key（用 mock 或 ENV ANTHROPIC_API_KEY）
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const POC_CWD = '/tmp/panmira-poc-01';
const SESSION_FILE = '/tmp/panmira-poc-01-session.json';
const LOG_FILE = '/tmp/panmira-poc-01-log.txt';

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(LOG_FILE, line + '\n', { flag: 'a' });
}

async function step1_runQuery() {
  log('=== STEP 1: Run query with persistSession:true ===');

  // 准备隔离 cwd
  if (!existsSync(POC_CWD)) {
    mkdirSync(POC_CWD, { recursive: true });
    log(`Created POC_CWD: ${POC_CWD}`);
  }

  // 跑 query
  let sessionId = null;
  let resultContent = null;
  let messageCount = 0;

  try {
    const stream = query({
      prompt: 'Reply with exactly "PoC-01-Step1" and nothing else.',
      options: {
        cwd: POC_CWD,
        persistSession: true,
        // 不传 model，用 SDK 默认
        abortController: new AbortController(),
      },
    });

    for await (const message of stream) {
      messageCount++;
      log(`MSG ${messageCount}: type=${message.type} subtype=${message.subtype || '-'}`);

      // 抓 session_id
      if (message.session_id && !sessionId) {
        sessionId = message.session_id;
        log(`  ↳ Captured session_id: ${sessionId}`);
      }

      // 抓 result 内容
      if (message.type === 'result') {
        resultContent = message.result;
        log(`  ↳ Result: ${JSON.stringify(message).slice(0, 200)}`);
      }
    }
  } catch (err) {
    log(`ERROR in step1: ${err.message}`);
    log(`stack: ${err.stack}`);
  }

  // 保存 state
  const state = {
    sessionId,
    resultContent,
    messageCount,
    cwd: POC_CWD,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(SESSION_FILE, JSON.stringify(state, null, 2));
  log(`State saved to ${SESSION_FILE}`);
  log(`State: ${JSON.stringify(state, null, 2)}`);

  // 检查 JSONL 文件
  log('');
  log('=== Checking JSONL files ===');
  checkSessionJsonl(sessionId);
}

function checkSessionJsonl(sessionId) {
  // SDK JSONL 通常在 ~/.claude/sessions/ 或 cwd/.claude/sessions/
  const possiblePaths = [
    join(homedir(), '.claude', 'sessions'),
    join(POC_CWD, '.claude', 'sessions'),
    join(homedir(), '.claude', 'projects'),  // SDK 可能按 project 组织
  ];

  for (const p of possiblePaths) {
    log(`Checking: ${p}`);
    if (existsSync(p)) {
      const items = readdirSync(p);
      log(`  exists, contains ${items.length} items: ${items.slice(0, 5).join(', ')}${items.length > 5 ? '...' : ''}`);

      // 找匹配 sessionId 的文件
      const matches = items.filter(name => sessionId && name.includes(sessionId));
      if (matches.length > 0) {
        log(`  ✅ Found matching: ${matches.join(', ')}`);
      }
    } else {
      log(`  ❌ does not exist`);
    }
  }
}

async function step2_resume() {
  log('');
  log('=== STEP 2: Resume previous session ===');

  if (!existsSync(SESSION_FILE)) {
    log(`❌ No previous session file. Run step1 first.`);
    return;
  }

  const state = JSON.parse(readFileSync(SESSION_FILE, 'utf8'));
  log(`Previous state: sessionId=${state.sessionId}, cwd=${state.cwd}`);

  // 方式 A: V1 用 continue:true 在同 cwd
  log('');
  log('--- Method A: V1 query with continue:true ---');
  let resumeSuccess = false;
  try {
    const stream = query({
      prompt: 'What did I just ask you? Reply in 5 words.',
      options: {
        cwd: state.cwd,  // 关键：同 cwd
        continue: true,   // 继续上次
        persistSession: true,
      },
    });

    let newSessionId = null;
    let result = null;
    let msgCount = 0;
    for await (const message of stream) {
      msgCount++;
      if (message.session_id && !newSessionId) newSessionId = message.session_id;
      if (message.type === 'result') result = message.result;
    }
    log(`newSessionId: ${newSessionId}`);
    log(`Same as before? ${newSessionId === state.sessionId ? '✅ YES (resumed)' : '❌ NO (new session)'}`);
    log(`Result: ${result}`);
    log(`Messages: ${msgCount}`);
    if (newSessionId === state.sessionId) resumeSuccess = true;
  } catch (err) {
    log(`Method A failed: ${err.message}`);
  }

  // 方式 B: V2 resumeSession (unstable)
  log('');
  log('--- Method B: V2 resumeSession (UNSTABLE) ---');
  try {
    const { unstable_v2_resumeSession } = await import('@anthropic-ai/claude-agent-sdk');
    const session = await unstable_v2_resumeSession(state.sessionId, {
      model: 'claude-sonnet-4-6',
      cwd: state.cwd,
    });
    log(`V2 resumed session: ${session.sessionId}`);
    await session.send('What did I just ask? Reply in 5 words.');
    for await (const msg of session.stream()) {
      log(`V2 msg: type=${msg.type}`);
      if (msg.type === 'result') break;
    }
    session.close();
    log(`V2 resumeSession: ✅ works`);
  } catch (err) {
    log(`V2 resumeSession failed: ${err.message}`);
    log(`(expected — V2 is unstable. V1 should suffice.)`);
  }

  // 总结
  log('');
  log('=== STEP 2 SUMMARY ===');
  log(`V1 continue:true works: ${resumeSuccess ? '✅' : '❌'}`);
  log(`Persist + resume pattern usable: ${resumeSuccess ? 'YES' : 'NEEDS MORE INVESTIGATION'}`);
}

async function step3_inspect() {
  log('');
  log('=== STEP 3: Inspect JSONL files (no SDK call) ===');

  // 找所有 .claude/sessions/ 下的 .jsonl 文件
  const searchPaths = [
    join(homedir(), '.claude'),
    join(POC_CWD, '.claude'),
  ];

  for (const p of searchPaths) {
    if (!existsSync(p)) {
      log(`${p}: ❌ not exist`);
      continue;
    }
    log(`${p}: ✅ exists`);
    walkAndReport(p, 0);
  }
}

function walkAndReport(dir, depth) {
  if (depth > 3) return;
  try {
    const items = readdirSync(dir);
    for (const item of items) {
      const full = join(dir, item);
      const stat = require('node:fs').statSync(full);
      if (stat.isDirectory()) {
        log(`  ${'  '.repeat(depth)}📁 ${item}/`);
        walkAndReport(full, depth + 1);
      } else {
        const sizeKb = (stat.size / 1024).toFixed(1);
        log(`  ${'  '.repeat(depth)}📄 ${item} (${sizeKb} KB)`);
      }
    }
  } catch (err) {
    log(`  walk error: ${err.message}`);
  }
}

// Main
const step = process.argv[2];
if (!step) {
  console.log('Usage: node poc-01-persist-session.mjs step1|step2|step3');
  process.exit(1);
}

log(`\n\n========= PoC #1 ${step} started =========`);

try {
  if (step === 'step1') await step1_runQuery();
  else if (step === 'step2') await step2_resume();
  else if (step === 'step3') step3_inspect();
  else console.log(`Unknown step: ${step}`);
} catch (err) {
  log(`FATAL: ${err.message}\n${err.stack}`);
}

log(`========= PoC #1 ${step} finished =========\n`);
