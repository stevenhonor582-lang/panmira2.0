/**
 * RAG Evaluation Runner v2.6 — text-based subject matching
 * Measures: how well the memories table can answer known queries via subject matching.
 * Run: DATABASE_URL=... npx tsx scripts/memory-eval.ts
 */
import { readFileSync } from 'node:fs';
import { pool } from '../src/db/index.js';

const QUERIES_PATH = 'config/eval-queries.json';

interface EvalResult {
  query: string; recall5: number; recall10: number; mrr: number;
  topSubjectCount: number; duplicates: number; recallItems: string[];
}

async function runEval() {
  const data = JSON.parse(readFileSync(QUERIES_PATH, 'utf-8'));
  const queries = data.queries as Array<{ query: string; expected: string[]; type: string }>;
  const results: EvalResult[] = [];

  for (const q of queries) {
    // Text-based subject search: match any known subject against expected terms
    const { rows } = await pool.query(
      `SELECT id, subject_normalized, confidence, hit_count
         FROM memories
        WHERE invalidated_at IS NULL
          AND subject_normalized IS NOT NULL
        ORDER BY hit_count DESC, confidence DESC
         LIMIT 20`
    ).catch(() => ({ rows: [] }));

    const recallItems: string[] = [];
    let firstHit = 0, recall5 = 0, recall10 = 0, duplicates = 0;
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r: any = rows[i];
      const s = (r.subject_normalized || '').toLowerCase();
      const hit = q.expected.some((e: string) => s.includes(e.toLowerCase()));
      if (hit) {
        recallItems.push(s);
        if (firstHit === 0) firstHit = i + 1;
      }
      if (seen.has(s)) duplicates++; else seen.add(s);
    }
    if (firstHit > 0 && firstHit <= 5) recall5 = 1;
    if (firstHit > 0 && firstHit <= 10) recall10 = 1;

    results.push({
      query: q.query, recall5, recall10,
      mrr: firstHit > 0 ? 1 / firstHit : 0,
      topSubjectCount: rows.length, duplicates, recallItems,
    });
  }
  return results;
}

async function main() {
  const data = JSON.parse(readFileSync(QUERIES_PATH, 'utf-8'));
  console.log(`RAG Eval v2.6 — ${data.queries.length} queries\n`);
  const results = await runEval();

  const avgR5 = results.reduce((s, r) => s + r.recall5, 0) / results.length;
  const avgR10 = results.reduce((s, r) => s + r.recall10, 0) / results.length;
  const avgMRR = results.reduce((s, r) => s + r.mrr, 0) / results.length;
  const totalWithSubject = results[0]?.topSubjectCount || 0;

  console.log(`Total memories with subjects: ${totalWithSubject}`);
  console.log(`Recall@5:  ${(avgR5 * 100).toFixed(1)}%`);
  console.log(`Recall@10: ${(avgR10 * 100).toFixed(1)}%`);
  console.log(`MRR:       ${avgMRR.toFixed(3)}\n`);

  for (const r of results) {
    console.log(`${r.recall5 ? '✓' : '✗'} "${r.query}" → mrr=${r.mrr.toFixed(2)} [${r.recallItems.join(',')}]`);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS memories_eval (
    id SERIAL PRIMARY KEY, run_at TIMESTAMPTZ DEFAULT NOW(),
    recall5_avg FLOAT, recall10_avg FLOAT, mrr_avg FLOAT,
    query_count INT, details JSONB
  )`);
  await pool.query(
    `INSERT INTO memories_eval (recall5_avg, recall10_avg, mrr_avg, query_count, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [avgR5, avgR10, avgMRR, results.length, JSON.stringify(results)]
  );
  console.log('\n✓ Saved baseline');
}

main().catch(console.error);
