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
  // Connection preflight — fail clearly if DB not reachable
  try {
    await pool.query('SELECT 1');
  } catch (err: any) {
    return {
      scenario: 'S1',
      description: 'panmira/rag.ts searchMemories — DB connection preflight',
      observed: {
        conclusion: 'CANNOT TEST — DB connection failed',
        connectionError: err.message,
        hint: 'Run with: DATABASE_URL=$(grep ^DATABASE_URL .env | cut -d= -f2-) npx tsx scripts/verify-harness.ts',
      },
    };
  }

  // Run the EXACT SQL from panmira/src/panmira/rag.ts searchMemories (lines 113-130)
  // The code uses `d.content` in WHERE but FROM clause has no `d` alias.
  const exactRagTsSql = `
    SELECT
      d.content,
      importance,
      created_at,
      CASE WHEN embedding IS NOT NULL
        THEN 1 - (embedding <=> $1::vector)
        ELSE 0
      END as relevance
    FROM memories
    WHERE d.content IS NOT NULL AND d.content != ''
    ORDER BY relevance DESC, importance DESC
    LIMIT $2
  `;
  const placeholderVector = `[${Array(1024).fill(0).join(',')}]`;

  let actualError: string | null = null;
  let errorSeverity = '';
  try {
    await pool.query(exactRagTsSql, [placeholderVector, 2]);
  } catch (err: any) {
    actualError = err.message;
    errorSeverity = err.severity || '';
  }

  // Only claim dead-code confirmed if the error is the SQL bug (column/alias reference)
  // Other errors (connection, permission) mean we can't tell
  const isAliasError = actualError !== null
    && /d\.content|column "d"|relation "d"|FROM-clause entry for table "d"/i.test(actualError);

  // Also run corrected SQL to see what would happen if the bug were fixed
  let correctedRowCount = 0;
  let correctedSample: unknown[] = [];
  try {
    const corrected = await pool.query(
      `SELECT content, importance, created_at,
              CASE WHEN embedding IS NOT NULL
                THEN 1 - (embedding <=> $1::vector)
                ELSE 0
              END as relevance
       FROM memories
       WHERE content IS NOT NULL AND content != ''
       ORDER BY relevance DESC, importance DESC
       LIMIT $2`,
      [placeholderVector, 2],
    );
    correctedRowCount = (corrected.rows as unknown[]).length;
    correctedSample = corrected.rows;
  } catch (err: any) {
    correctedSample = [{ error: err.message }];
  }

  return {
    scenario: 'S1',
    description: 'panmira/rag.ts searchMemories — does the EXACT SQL error on the d.content alias bug?',
    observed: {
      exactSqlError: actualError,
      errorSeverity,
      isAliasBug: isAliasError,
      conclusion: isAliasError
        ? 'DEAD CODE CONFIRMED — SQL errors on d.content alias, rag.ts catch returns []'
        : actualError
          ? `AMBIGUOUS — SQL errored but not on the alias bug (${actualError})`
          : 'SQL runs cleanly — dead code may already be fixed',
      correctedSqlRowCount: correctedRowCount,
      correctedSample,
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
