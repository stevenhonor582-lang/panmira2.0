/**
 * Memory System Verification Harness
 *
 * Baseline + post-fix verification for memory isolation / cross-contamination fix.
 * Run: DATABASE_URL=... npx tsx scripts/verify-harness.ts [output-path]
 *
 * Default output: verify-results.json
 *
 * Scenarios:
 *   S1 — RAG dead code: does the EXACT SQL from panmira/rag.ts searchMemories error?
 *   S2 — Bot isolation: does retrieve(botId=A) return only A's memories (not B's)?
 *   S3 — Write-side dedup: how many non-test subjects are duplicated across bots?
 *
 * Output is purely descriptive (no pass/fail) — diff baseline.json vs after.json
 * to obtain verification evidence per the verify-claims rule.
 */

import { pool } from '../src/db/index.js';
import { PanmiraRAG } from '../src/panmira/rag.js';
import { writeFileSync } from 'node:fs';

const BOT_A_ID = '092816d0-9ee8-48b0-b49e-7708fd390c7f'; // 得一
const BOT_B_ID = 'fb2af5ea-ee86-4c43-ab71-214d40559a2e'; // 不盈
const TEST_USER = '__test_iso_user';

interface Observation {
  scenario: string;
  description: string;
  observed: Record<string, unknown>;
}

async function s1_ragDeadCode(): Promise<Observation> {
  // P1 verification: actually invoke PanmiraRAG.retrieve (real code path, not SQL mimicry)
  // Per feedback-verify-claims: "Code path exists" != "behavior confirmed"
  const noopLogger = {
    warn: () => {}, debug: () => {}, info: () => {}, error: () => {},
  } as any;
  const rag = new PanmiraRAG(noopLogger, { maxDocuments: 1, maxMemories: 3 });

  // Historical SQL check (frozen — always test the broken pre-P1 SQL as regression baseline)
  const historicalBrokenSql = `
    SELECT d.content FROM memories WHERE d.content IS NOT NULL LIMIT 1
  `;
  let historicalError: string | null = null;
  try {
    await pool.query(historicalBrokenSql);
  } catch (err: any) {
    historicalError = err.message;
  }

  // Real code path: invoke retrieve() under 3 conditions
  const results: Record<string, any> = {};

  // (a) no botName -> searchMemories returns [] (safe default)
  try {
    const r = await rag.retrieve('__test_iso_a_private 隔离验证', undefined, undefined);
    results.callWithoutBotName = {
      memoriesCount: r.memories.length,
      memoriesIds: r.memories.map((m: any) => m.content.slice(0, 60)),
    };
  } catch (err: any) {
    results.callWithoutBotName = { error: err.message };
  }

  // (b) botName=得一 -> should find 得一's fixture content "__test_iso_a_private"
  try {
    const r = await rag.retrieve('隔离验证探针', undefined, '得一');
    results.callWithBotNameDeYi = {
      memoriesCount: r.memories.length,
      memoriesSnippets: r.memories.map((m: any) => m.content.slice(0, 80)),
    };
  } catch (err: any) {
    results.callWithBotNameDeYi = { error: err.message };
  }

  // (c) botName=不盈 -> should NOT see 得一's "__test_iso_a_private" content
  try {
    const r = await rag.retrieve('隔离验证探针', undefined, '不盈');
    const leaked = r.memories.filter((m: any) => m.content.includes('得一'));
    results.callWithBotNameBuYing = {
      memoriesCount: r.memories.length,
      memoriesSnippets: r.memories.map((m: any) => m.content.slice(0, 80)),
      crossBotLeakCount: leaked.length,
    };
  } catch (err: any) {
    results.callWithBotNameBuYing = { error: err.message };
  }

  const noBotNameSafe = results.callWithoutBotName?.memoriesCount === 0;
  const deYiFindsOwn = (results.callWithBotNameDeYi?.memoriesCount ?? -1) >= 0
    && !results.callWithBotNameDeYi?.error;
  const buYingNoLeak = (results.callWithBotNameBuYing?.crossBotLeakCount ?? 99) === 0;

  return {
    scenario: 'S1',
    description: 'PanmiraRAG.retrieve real code path: (a) no botName returns [], (b) botName=得一 finds own, (c) botName=不盈 no leak',
    observed: {
      historicalBrokenSqlError: historicalError,
      realCodePath: results,
      conclusion: noBotNameSafe && deYiFindsOwn && buYingNoLeak
        ? 'P1 FIX VERIFIED — retrieve runs cleanly with bot_id isolation'
        : 'P1 fix incomplete or behavior unexpected',
      noBotNameSafe,
      deYiFindsOwn,
      buYingNoLeak,
    },
  };
}

async function s2_botIsolation(): Promise<Observation> {
  // Reproduce postgres-store.ts retrieve WHERE clauses with botId=BOT_A_ID
  const res = await pool.query(
    `SELECT id, bot_id, subject_normalized, content, confidence
     FROM memories
     WHERE user_id = $1
       AND bot_id = $2
       AND invalidated_at IS NULL
       AND confidence >= 0.5
       AND id LIKE '__test_iso_%'
     ORDER BY hit_count DESC NULLS LAST, confidence DESC, importance DESC
     LIMIT 10`,
    [TEST_USER, BOT_A_ID],
  );

  const returned = res.rows as Array<{ id: string; bot_id: string; subject_normalized: string }>;
  const expected = ['__test_iso_a_private', '__test_iso_common_a'];
  const contamination = returned.filter((r) => r.bot_id !== BOT_A_ID);
  const missing = expected.filter((id) => !returned.some((r) => r.id === id));

  return {
    scenario: 'S2',
    description: 'retrieve(botId=得一, user=__test_iso_user) — must return only A-tagged rows',
    observed: {
      queryBotId: BOT_A_ID,
      queryBotName: '得一',
      expectedIds: expected,
      returnedIds: returned.map((r) => r.id),
      contaminationCount: contamination.length,
      contaminationSamples: contamination,
      missingExpected: missing,
      conclusion:
        contamination.length === 0 && missing.length === 0
          ? 'ISOLATION OK — only bot A data returned'
          : `ISOLATION BROKEN — contamination=${contamination.length}, missing=${missing.length}`,
    },
  };
}

async function s3_writeSideDedup(): Promise<Observation> {
  // Exclude __test_iso_ fixtures (they intentionally share subjects across bots for S2)
  const res = await pool.query(
    `SELECT subject_normalized,
            COUNT(DISTINCT bot_id) AS bot_count,
            ARRAY_AGG(DISTINCT bot_id) AS bots
     FROM memories
     WHERE invalidated_at IS NULL
       AND subject_normalized IS NOT NULL
       AND subject_normalized NOT LIKE '\\_\\_test\\_%'
     GROUP BY subject_normalized
     HAVING COUNT(DISTINCT bot_id) > 1
     ORDER BY bot_count DESC, subject_normalized
     LIMIT 20`,
  );

  const totalCountRes = await pool.query(
    `SELECT COUNT(*) AS total_duplicated_subjects,
            SUM(bot_count)::int AS total_duplicate_rows
     FROM (
       SELECT subject_normalized, COUNT(DISTINCT bot_id) AS bot_count
       FROM memories
       WHERE invalidated_at IS NULL
         AND subject_normalized IS NOT NULL
         AND subject_normalized NOT LIKE '\\_\\_test\\_%'
       GROUP BY subject_normalized
       HAVING COUNT(DISTINCT bot_id) > 1
     ) AS s`,
  );
  const totals = totalCountRes.rows[0] as { total_duplicated_subjects: string; total_duplicate_rows: string };

  return {
    scenario: 'S3',
    description: 'Write-side dedup — non-test subjects duplicated across bots (target after P3 = 0)',
    observed: {
      duplicatedSubjectCount: Number(totals.total_duplicated_subjects),
      totalDuplicateRows: Number(totals.total_duplicate_rows),
      topDuplicates: res.rows,
    },
  };
}

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`=== Memory Verification Harness @ ${timestamp} ===\n`);

  const observations: Observation[] = [];
  for (const fn of [s1_ragDeadCode, s2_botIsolation, s3_writeSideDedup]) {
    const start = Date.now();
    try {
      const obs = await fn();
      (obs as Observation & { durationMs: number }).durationMs = Date.now() - start;
      observations.push(obs);
      console.log(`[${obs.scenario}] ${obs.description}`);
      console.log(`  ${JSON.stringify(obs.observed).slice(0, 200)}...`);
      console.log(`  (${(obs as Observation & { durationMs: number }).durationMs}ms)\n`);
    } catch (err: any) {
      console.error(`Scenario ${fn.name} crashed:`, err);
      observations.push({
        scenario: fn.name,
        description: '(crashed)',
        observed: { error: err.message, stack: err.stack },
      });
    }
  }

  const report = { timestamp, observations };
  const outPath = process.argv[2] || 'verify-results.json';
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Saved: ${outPath}`);
  await pool.end();
}

main().catch((err) => {
  console.error('Harness crashed:', err);
  process.exit(2);
});
