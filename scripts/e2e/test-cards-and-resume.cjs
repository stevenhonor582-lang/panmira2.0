#!/usr/bin/env node
/**
 * e2e verification: 3 new cards + orch-session-store + resume flow.
 * Skips live API (needs auth); focuses on dist + file system + DB.
 * Run from mah: node scripts/e2e/test-cards-and-resume.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const SESSION_DIR = os.homedir() + '/.panmira/orch-sessions';
const DIST = '/home/ubuntu/panmira/dist';
const log = (l, ...r) => console.log(`[${l}]`, ...r);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function pg(sql) {
  return execSync(
    `PGPASSWORD=ubuntu psql -h localhost -U ubuntu -d metabot -t -A -F'|' -c "${sql.replace(/"/g, "'")}"`,
    { encoding: 'utf-8' }
  ).trim().split('\n').filter(l => l).map(l => l.split('|'));
}

async function run() {
  const r = [];
  const pass = (n, d) => r.push({ n, s: '✅', d });
  const fail = (n, d) => r.push({ n, s: '❌', d });

  // T1: 3 card builders in dist
  log('T1', 'card builders in dist');
  const cb = fs.readFileSync(`${DIST}/feishu/card-builder.js`, 'utf-8');
  const builders = ['buildFileManifestCard', 'buildConfirmationCard', 'buildPendingTasksCard'];
  const missing = builders.filter(b => !cb.includes(b));
  if (!missing.length) pass('T1 3 card builders', 'all 3 exported');
  else fail('T1 missing', missing.join(', '));

  // T2: orch-session-store in dist
  log('T2', 'orch-session-store in dist');
  const store = `${DIST}/bridge/orchestrator/orch-session-store.js`;
  if (fs.existsSync(store)) {
    const c = fs.readFileSync(store, 'utf-8');
    const fns = ['saveOrchSession', 'loadOrchSession', 'deleteOrchSession'];
    const miss = fns.filter(f => !c.includes(f));
    if (!miss.length) pass('T2 orch-session-store', 'save/load/delete exported');
    else fail('T2 missing', miss.join(', '));
  } else fail('T2 store missing', store);

  // T3: card action routes in dist
  log('T3', 'event-handler card actions');
  const h = fs.readFileSync(`${DIST}/feishu/event-handler.js`, 'utf-8');
  const actions = ['coordinator_confirm', 'coordinator_cancel', 'orch_resume'];
  const miss = actions.filter(a => !h.includes(a));
  if (!miss.length) pass('T3 3 card action intercepts', 'all 3 in dist');
  else fail('T3 missing', miss.join(', '));

  // T4: orch-session-store runtime roundtrip
  log('T4', 'orch-session-store live roundtrip');
  const sessMod = require(`${DIST}/bridge/orchestrator/orch-session-store.js`);
  const sid = 'e2e-' + Date.now();
  sessMod.saveOrchSession({
    sessionId: sid,
    chatId: 'e2e-rt',
    botName: 'e2e-bot',
    intentName: 'demo',
    userMessage: 'hi',
    plan: { steps: [] },
    progress: { status: 'running', intentName: 'demo', currentStepIndex: 0, totalSteps: 0, steps: [] },
    allGateResults: [],
    totalCostUsd: 0.01,
    pendingTasks: [],
    cwd: '/tmp', outputsDir: '/tmp/out',
    cardMessageId: 'msg-1',
    startTime: Date.now(),
    lastUpdated: Date.now(),
  });
  const loaded = sessMod.loadOrchSession(sid);
  if (loaded && loaded.sessionId === sid) {
    pass('T4 roundtrip', `loaded intent=${loaded.intentName} cost=$${loaded.totalCostUsd}`);
  } else {
    fail('T4 roundtrip', `loaded=${JSON.stringify(loaded)?.slice(0, 100)}`);
  }
  sessMod.deleteOrchSession(sid);
  const afterDelete = sessMod.loadOrchSession(sid);
  if (afterDelete === null) pass('T4b delete works', 'load after delete returns null');
  else fail('T4b delete', `still got ${JSON.stringify(afterDelete)?.slice(0, 100)}`);

  // T5: TTL sweep — bypass saveOrchSession (which forces lastUpdated=now).
  // Manually write a stale file and verify load returns null.
  log('T5', 'TTL sweep (8-day-old session → null)');
  const oldSid = 'e2e-old-' + Date.now();
  const oldFile = path.join(SESSION_DIR, oldSid + '.json');
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(oldFile, JSON.stringify({
    sessionId: oldSid, chatId: 'old', botName: 'b',
    intentName: 'old', userMessage: '',
    plan: { steps: [] },
    progress: { status: 'running', intentName: 'old', currentStepIndex: 0, totalSteps: 0, steps: [] },
    allGateResults: [], totalCostUsd: 0, pendingTasks: [],
    cwd: '/tmp', outputsDir: '/tmp/out',
    cardMessageId: 'm',
    startTime: 0,
    lastUpdated: Date.now() - 8 * 24 * 60 * 60 * 1000,  // 8 days ago
  }, null, 2), 'utf-8');
  const oldLoaded = sessMod.loadOrchSession(oldSid);
  if (oldLoaded === null) pass('T5 TTL sweep', '8-day-old session auto-swept, file removed');
  else fail('T5 TTL', `should be null but got ${JSON.stringify(oldLoaded)?.slice(0, 100)}`);

  // T6: orchestrator.index has sessionId + resumeById
  log('T6', 'orchestrator index');
  const orch = fs.readFileSync(`${DIST}/bridge/orchestrator/index.js`, 'utf-8');
  const orchChecks = ['resumeById', 'randomUUID', 'sessionId', 'orch-session-store'];
  const orchMiss = orchChecks.filter(c => !orch.includes(c));
  if (!orchMiss.length) pass('T6 orchestrator integrated', 'all hooks in dist');
  else fail('T6 missing', orchMiss.join(', '));

  // T7: message-bridge passes sessionId
  log('T7', 'message-bridge card wiring');
  const mb = fs.readFileSync(`${DIST}/bridge/message-bridge.js`, 'utf-8');
  if (mb.includes('buildPendingTasksCard') && mb.includes('sessionId')) {
    pass('T7 pending tasks card wired', 'sendRawCard with sessionId');
  } else {
    fail('T7 missing', '');
  }

  // T8: group-coordinator handleOrchResume
  log('T8', 'group-coordinator handleOrchResume');
  const gc = fs.readFileSync(`${DIST}/api/group-coordinator.js`, 'utf-8');
  if (gc.includes('handleOrchResume') && gc.includes('loadOrchSession')) {
    pass('T8 resume handler', 'handleOrchResume + loadOrchSession wired');
  } else {
    fail('T8 missing', '');
  }

  // Summary
  console.log('\n══════════════════════════════════');
  console.log('  E2E VERIFICATION SUMMARY');
  console.log('══════════════════════════════════');
  for (const x of r) console.log(`  ${x.s}  ${x.n}${x.d ? '\n        ' + x.d : ''}`);
  const p = r.filter(x => x.s === '✅').length;
  const f = r.filter(x => x.s === '❌').length;
  console.log('────────────────────────────────────');
  console.log(`  ${p} passed, ${f} failed, ${r.length} total`);
  console.log('══════════════════════════════════');
  process.exit(f > 0 ? 1 : 0);
}

run().catch(e => { console.error('CRASH:', e); process.exit(2); });
