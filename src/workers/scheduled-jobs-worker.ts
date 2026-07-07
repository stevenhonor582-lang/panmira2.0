/**
 * Scheduled Jobs Worker (Phase 3 #3):
 * - Every 60s, scan scheduled_jobs with trigger_type='cron' and enabled=true
 * - For each due job, find matching pipeline and trigger it
 * - Update last_run_at / last_status / last_duration_ms / run_count
 *
 * MVP: only supports trigger_type='cron'. event/api/manual skipped (YAGNI).
 */
import { pool } from '../db/index.js';
import { nextCronOccurrence, isValidCron } from '../scheduler/cron-utils.js';
import { findPipelinesForAgent, triggerPipelineForBot } from '../services/pipeline-bot-trigger.js';
import { sanitizeErrorMessage } from '../services/pipeline-engine.js';
import type { Logger } from '../utils/logger.js';

interface ScheduledJobRow {
  id: string;
  name: string;
  agent_template_id: string | null;
  trigger_type: string;
  cron_expression: string | null;
  input_template: unknown;
  enabled: boolean;
  last_run_at: Date | null;
  run_count: number;
  created_at: Date;
}

export interface DueJob {
  id: string;
  name: string;
  agentTemplateId: string | null;
  input: Record<string, unknown>;
  /** Next scheduled time AFTER the last run (or creation if never run) */
  nextDue: number;
}

/** Pure function: compute whether a job is due. Exposed for tests. */
export function isJobDue(job: ScheduledJobRow, now: number = Date.now()): boolean {
  if (!job.enabled) return false;
  if (job.trigger_type !== 'cron') return false;
  if (!job.cron_expression || !isValidCron(job.cron_expression)) return false;
  const baseTime = job.last_run_at ? new Date(job.last_run_at) : new Date(job.created_at);
  const next = nextCronOccurrence(job.cron_expression, undefined, baseTime);
  return next <= now;
}

/** Pure-ish: list due jobs from DB. Exposed for tests (uses injected pool). */
export async function findDueJobs(poolOverride: typeof pool = pool, now: number = Date.now()): Promise<DueJob[]> {
  const r = await poolOverride.query(`
    SELECT id, name, agent_template_id, trigger_type, cron_expression,
           input_template, enabled, last_run_at, run_count, created_at
    FROM scheduled_jobs
    WHERE enabled = true AND trigger_type = 'cron'
  `);
  const due: DueJob[] = [];
  for (const row of r.rows) {
    if (!isJobDue(row, now)) continue;
    const baseTime = row.last_run_at ? new Date(row.last_run_at) : new Date(row.created_at);
    const nextDue = nextCronOccurrence(row.cron_expression!, undefined, baseTime);
    due.push({
      id: row.id,
      name: row.name,
      agentTemplateId: row.agent_template_id,
      input: (row.input_template as Record<string, unknown> | null) ?? {},
      nextDue,
    });
  }
  return due;
}

/** Execute a due job. Returns duration in ms. */
export async function runDueJob(
  job: DueJob,
  poolOverride: typeof pool = pool,
): Promise<{ ok: boolean; error?: string; durationMs: number }> {
  const start = Date.now();
  let ok = false;
  let error: string | undefined;
  if (!job.agentTemplateId) {
    error = 'no agent_template_id';
  } else {
    // Look up the owning tenant for this job so the pipeline run is multi-tenant scoped.
    // If the job is somehow missing (deleted concurrently) or has no tenant_id, fall back
    // to 'system' to preserve single-tenant behavior.
    let tenantId: string | undefined;
    try {
      const tRes = await poolOverride.query(
        `SELECT tenant_id FROM scheduled_jobs WHERE id = $1`,
        [job.id],
      );
      const row = tRes.rows?.[0] as { tenant_id?: string | null } | undefined;
      tenantId = row?.tenant_id ?? undefined;
    } catch {
      // ignore; tenantId stays undefined → executePipeline falls back to 'system'
    }

    const pipelines = await findPipelinesForAgent(job.agentTemplateId);
    if (pipelines.length === 0) {
      error = 'no matching pipeline';
    } else {
      const out = await triggerPipelineForBot(
        job.agentTemplateId,
        JSON.stringify(job.input),
        `cron-${job.id}-${Date.now()}`,
        tenantId,
      );
      if (out) ok = true;
      else error = 'pipeline failed';
    }
  }
  const durationMs = Date.now() - start;
  await poolOverride.query(
    `UPDATE scheduled_jobs
     SET last_run_at = NOW(),
         last_status = $1,
         last_duration_ms = $2,
         last_error = $3,
         run_count = COALESCE(run_count, 0) + 1,
         success_count = COALESCE(success_count, 0) + $4
     WHERE id = $5`,
    [ok ? 'success' : 'failed', durationMs, error ? sanitizeErrorMessage(new Error(error)) : null, ok ? 1 : 0, job.id],
  );
  return { ok, error, durationMs };
}

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

/** Start the worker. Idempotent (safe to call multiple times). */
export function startScheduledJobsWorker(logger: Logger, intervalMs: number = 60_000): void {
  if (workerTimer) return;
  const tick = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      const due = await findDueJobs();
      if (due.length === 0) return;
      logger.info({ count: due.length }, 'scheduled-jobs: due jobs found');
      for (const job of due) {
        try {
          const r = await runDueJob(job);
          logger.info({ jobId: job.id, name: job.name, ok: r.ok, durationMs: r.durationMs, error: r.error }, 'scheduled-jobs: ran');
        } catch (e: any) {
          logger.error({ err: e?.message, jobId: job.id }, 'scheduled-jobs: runDueJob threw');
        }
      }
    } catch (e: any) {
      logger.error({ err: e?.message }, 'scheduled-jobs: tick failed');
    } finally {
      workerRunning = false;
    }
  };
  workerTimer = setInterval(tick, intervalMs);
  logger.info({ intervalMs }, 'scheduled-jobs: worker started');
  // Run once immediately (don't wait first interval)
  void tick();
}

/** Stop the worker (test hook). */
export function stopScheduledJobsWorker(): void {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}
