/**
 * R48-W1 P1.2 memory-curator 后台 worker
 *
 * 职责(按 spec §2.2 + 用户任务,合并为 4 个任务):
 *   1. importance 重新计算
 *   2. 衰减状态机(active / decaying / pending_purge / invalidated,半衰期 45-60 天)
 *   3. L1→L2→L3 升级规则
 *   4. cosine > 0.92 合并(语义相似合并)
 *
 * 第一周 dry_run:只统计不动数据(spec §7.2 误杀风险预防)
 *   - runCurator({ dryRun: true }) 返回各任务的统计,不入 DB
 *   - 第二周起小流量(limit 100/次),通过 runCurator({ dryRun: false, limit: 100 }) 调用
 */
import { pool, db } from '../db/index.js';
import { memories } from '../db/schema.js';

const HALF_LIFE_DAYS = 50;
const PROMOTE_HIT_THRESHOLD = 5;
const PROMOTE_CONFIDENCE_MIN = 0.7;
const MERGE_COSINE_THRESHOLD = 0.92;

export interface CuratorStats {
  ranAt: string;
  dryRun: boolean;
  importance: { wouldRecompute: number; sample: Array<{ id: string; oldImp: number; newImp: number }> };
  decay: { active: number; decaying: number; pendingPurge: number; wouldInvalidate: number };
  promotion: { wouldPromoteL1toL2: number; wouldPromoteL2toL3: number };
  merge: { wouldMerge: number; samplePairs: Array<{ a: string; b: string; cosine: number }> };
}

export async function recomputeImportance(dryRun: boolean, limit = 500) {
  const { rows } = await pool.query(
    `SELECT id, importance, confidence, hit_count, layer, created_at
     FROM memories
     WHERE invalidated_at IS NULL
     ORDER BY hit_count DESC, created_at DESC
     LIMIT $1`,
    [limit],
  );
  if (rows.length === 0) return { wouldRecompute: 0, sample: [] };
  const maxHit = Math.max(...rows.map((r: any) => r.hit_count || 0), 1);
  const now = Date.now();
  const updates = [];
  const sample = [];
  for (const r of rows as any[]) {
    const accessScore = Math.min((r.hit_count || 0) / maxHit, 1.0);
    const ageDays = Math.max(0, (now - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const freshnessScore = 1 / (1 + ageDays / HALF_LIFE_DAYS);
    const manualScore = r.importance ?? 0.5;
    const llmScore = r.confidence ?? 0.5;
    const layerScore = r.layer === 1 ? 0.3 : r.layer === 2 ? 0.6 : 1.0;
    const newImp = Math.max(0, Math.min(1,
      0.4 * accessScore + 0.2 * freshnessScore + 0.2 * manualScore + 0.1 * llmScore + 0.1 * layerScore));
    updates.push({ id: r.id, newImp });
    if (sample.length < 5) sample.push({ id: r.id, oldImp: r.importance ?? 0.5, newImp });
  }
  if (!dryRun) {
    const values = updates.map((u) => `WHEN '${u.id}' THEN ${u.newImp.toFixed(4)}`).join(' ');
    const ids = updates.map((u) => `'${u.id}'`).join(',');
    await pool.query(
      `UPDATE memories SET importance = CASE id ${values} ELSE importance END, updated_at = NOW() WHERE id IN (${ids})`,
    );
  }
  return { wouldRecompute: updates.length, sample };
}

export async function decayStateMachine(dryRun: boolean) {
  const halfLifeSec = HALF_LIFE_DAYS * 24 * 60 * 60;
  const purgeSec = 2 * halfLifeSec;
  const stats = await pool.query(
    `SELECT
       CASE
         WHEN invalidated_at IS NOT NULL THEN 'invalidated'
         WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < $1 AND (hit_count IS NULL OR hit_count > 0) THEN 'active'
         WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < $1 THEN 'decaying'
         WHEN EXTRACT(EPOCH FROM (NOW() - created_at)) < $2 THEN 'pending_purge'
         ELSE 'would_invalidate'
       END AS bucket,
       count(*)::int AS cnt
     FROM memories
     GROUP BY 1`,
    [halfLifeSec, purgeSec],
  );
  const buckets = { active: 0, decaying: 0, pending_purge: 0, would_invalidate: 0 };
  for (const r of stats.rows as any[]) buckets[r.bucket as keyof typeof buckets] = r.cnt;
  if (!dryRun) {
    await pool.query(
      `UPDATE memories
       SET invalidated_at = NOW(),
           updated_at = NOW(),
           metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                           jsonb_build_object('curator_reason', 'pending_purge_age', 'curator_at', NOW()::text)
       WHERE invalidated_at IS NULL
         AND (hit_count IS NULL OR hit_count = 0)
         AND EXTRACT(EPOCH FROM (NOW() - created_at)) >= $1`,
      [purgeSec],
    );
  }
  return {
    active: buckets.active,
    decaying: buckets.decaying,
    pendingPurge: buckets.pending_purge,
    wouldInvalidate: buckets.would_invalidate,
  };
}

export async function promoteLayers(dryRun: boolean) {
  const l1toL2 = await pool.query(
    `SELECT count(*)::int AS cnt FROM memories
     WHERE layer = 1 AND invalidated_at IS NULL AND superseded_by IS NULL
       AND hit_count >= $1 AND confidence >= $2
       AND created_at < NOW() - INTERVAL '7 days'`,
    [PROMOTE_HIT_THRESHOLD, PROMOTE_CONFIDENCE_MIN],
  );
  const l2toL3 = await pool.query(
    `SELECT count(*)::int AS cnt FROM memories
     WHERE layer = 2 AND invalidated_at IS NULL AND superseded_by IS NULL
       AND hit_count >= $1 AND confidence >= $2 AND importance >= 0.7
       AND created_at < NOW() - INTERVAL '7 days'`,
    [PROMOTE_HIT_THRESHOLD, PROMOTE_CONFIDENCE_MIN],
  );
  if (!dryRun) {
    await pool.query(
      `UPDATE memories SET layer = 2, updated_at = NOW()
       WHERE layer = 1 AND invalidated_at IS NULL AND superseded_by IS NULL
         AND hit_count >= $1 AND confidence >= $2
         AND created_at < NOW() - INTERVAL '7 days'`,
      [PROMOTE_HIT_THRESHOLD, PROMOTE_CONFIDENCE_MIN],
    );
    await pool.query(
      `UPDATE memories SET layer = 3, updated_at = NOW()
       WHERE layer = 2 AND invalidated_at IS NULL AND superseded_by IS NULL
         AND hit_count >= $1 AND confidence >= $2 AND importance >= 0.7
         AND created_at < NOW() - INTERVAL '7 days'`,
      [PROMOTE_HIT_THRESHOLD, PROMOTE_CONFIDENCE_MIN],
    );
  }
  return {
    wouldPromoteL1toL2: l1toL2.rows[0]?.cnt ?? 0,
    wouldPromoteL2toL3: l2toL3.rows[0]?.cnt ?? 0,
  };
}

export async function mergeSimilar(dryRun: boolean, limit = 100) {
  const candidates = await pool.query(
    `SELECT id FROM memories
     WHERE invalidated_at IS NULL AND superseded_by IS NULL AND embedding IS NOT NULL
     ORDER BY updated_at DESC LIMIT $1`,
    [limit],
  );
  if (candidates.rows.length < 2) return { wouldMerge: 0, samplePairs: [] };
  const ids = candidates.rows.map((r: any) => r.id);
  const pairs = await pool.query(
    `SELECT a.id AS a, b.id AS b, ((1 - (a.embedding <=> b.embedding)))::float8 AS cosine
     FROM (SELECT id, embedding FROM memories WHERE id = ANY($1::text[])) a
     JOIN (SELECT id, embedding FROM memories WHERE id = ANY($1::text[])) b ON a.id < b.id
     WHERE (a.embedding <=> b.embedding) < (1::float8 - $2)
     ORDER BY cosine DESC LIMIT 50`,
    [ids, MERGE_COSINE_THRESHOLD],
  );
  const samplePairs = pairs.rows.slice(0, 5).map((r: any) => ({
    a: r.a, b: r.b, cosine: Number(Number(r.cosine).toFixed(4)),
  }));
  if (!dryRun && pairs.rows.length > 0) {
    for (const p of pairs.rows as any[]) {
      await pool.query(
        `UPDATE memories
         SET superseded_by = $1, invalidated_at = NOW(), updated_at = NOW(),
             metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                             jsonb_build_object('curator_reason', 'merge_cosine_above_threshold',
                                                'merge_cosine', $3::text, 'curator_at', NOW()::text)
         WHERE id = $2 AND invalidated_at IS NULL`,
        [p.a, p.b, Number(p.cosine).toFixed(4)],
      );
    }
  }
  return { wouldMerge: pairs.rows.length, samplePairs };
}

export async function runCurator(opts: { dryRun?: boolean; limit?: number } = {}): Promise<CuratorStats> {
  const dryRun = opts.dryRun ?? true;
  const limit = opts.limit ?? 500;
  const [importance, decay, promotion, merge] = await Promise.all([
    recomputeImportance(dryRun, limit),
    decayStateMachine(dryRun),
    promoteLayers(dryRun),
    mergeSimilar(dryRun, Math.min(limit, 200)),
  ]);
  return {
    ranAt: new Date().toISOString(),
    dryRun,
    importance: { wouldRecompute: importance.wouldRecompute, sample: importance.sample },
    decay,
    promotion,
    merge: { wouldMerge: merge.wouldMerge, samplePairs: merge.samplePairs },
  };
}

export async function startCuratorCron(intervalMs = 6 * 60 * 60 * 1000): Promise<NodeJS.Timeout> {
  const tick = async () => {
    try {
      const stats = await runCurator({ dryRun: true });
      console.log('[memory-curator] dry-run stats:', JSON.stringify(stats));
    } catch (err) {
      console.error('[memory-curator] tick failed', err);
    }
  };
  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[memory-curator] cron started (dry-run), interval=${intervalMs}ms`);
  return timer;
}
