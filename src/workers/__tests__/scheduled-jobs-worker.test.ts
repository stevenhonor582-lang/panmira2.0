import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../db/index.js', () => ({
  pool: { query: vi.fn() },
}));

vi.mock('../../services/pipeline-bot-trigger.js', () => ({
  findPipelinesForAgent: vi.fn(),
  triggerPipelineForBot: vi.fn(),
}));

import { pool } from '../../db/index.js';
import * as botTrigger from '../../services/pipeline-bot-trigger.js';
import { isJobDue, findDueJobs, runDueJob } from '../scheduled-jobs-worker.js';

beforeEach(() => {
  vi.clearAllMocks();
});

const makeJob = (over: Partial<{ id: string; name: string; agent_template_id: string | null; trigger_type: string; cron_expression: string | null; input_template: unknown; enabled: boolean; last_run_at: Date | null; run_count: number; created_at: Date }> = {}): any => ({
  id: over.id ?? 'j-1',
  name: over.name ?? 'Test',
  agent_template_id: over.agent_template_id ?? 'a-1',
  trigger_type: over.trigger_type ?? 'cron',
  cron_expression: over.cron_expression ?? '* * * * *',
  input_template: over.input_template ?? { topic: 'x' },
  enabled: over.enabled ?? true,
  last_run_at: over.last_run_at ?? null,
  run_count: over.run_count ?? 0,
  created_at: over.created_at ?? new Date(Date.now() - 60_000),
});

describe('scheduled-jobs-worker › isJobDue', () => {
  it('enabled + 永远到期 → true', () => {
    const job = makeJob({ cron_expression: '* * * * *' });
    expect(isJobDue(job, Date.now())).toBe(true);
  });
  it('disabled → false', () => {
    const job = makeJob({ enabled: false });
    expect(isJobDue(job, Date.now())).toBe(false);
  });
  it('trigger_type != cron → false', () => {
    const job = makeJob({ trigger_type: 'event' });
    expect(isJobDue(job, Date.now())).toBe(false);
  });
  it('invalid cron → false', () => {
    const job = makeJob({ cron_expression: 'not-a-cron' });
    expect(isJobDue(job, Date.now())).toBe(false);
  });
  it('future cron 下次执行时间在 now 之后 → false', () => {
    const job = makeJob({
      cron_expression: '0 3 * * *',
      last_run_at: new Date(),
    });
    expect(isJobDue(job, Date.now())).toBe(false);
  });
});

describe('scheduled-jobs-worker › findDueJobs', () => {
  it('空 DB → []', async () => {
    (pool.query as any).mockResolvedValue({ rows: [] });
    const out = await findDueJobs();
    expect(out).toEqual([]);
  });
  it('enabled + 永远到期 → 包含', async () => {
    (pool.query as any).mockResolvedValue({ rows: [makeJob()] });
    const out = await findDueJobs();
    expect(out).toHaveLength(1);
    expect(out[0]!.name).toBe('Test');
  });
  it('disabled → 过滤', async () => {
    (pool.query as any).mockResolvedValue({ rows: [makeJob({ enabled: false })] });
    const out = await findDueJobs();
    expect(out).toEqual([]);
  });
});

describe('scheduled-jobs-worker › runDueJob', () => {
  it('无 agentTemplateId → 返 error', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    const r = await runDueJob({ id: 'j-1', name: 'X', agentTemplateId: null, input: {}, nextDue: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no agent_template_id');
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE scheduled_jobs'), expect.any(Array));
  });
  it('无匹配 pipeline → 返 error', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    (botTrigger.findPipelinesForAgent as any).mockResolvedValue([]);
    const r = await runDueJob({ id: 'j-1', name: 'X', agentTemplateId: 'a-1', input: {}, nextDue: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('no matching pipeline');
  });
  it('pipeline 成功 → ok', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    (botTrigger.findPipelinesForAgent as any).mockResolvedValue([{ id: 'p-1' }]);
    (botTrigger.triggerPipelineForBot as any).mockResolvedValue({ output: 'ok', runId: 'r-1' });
    const r = await runDueJob({ id: 'j-1', name: 'X', agentTemplateId: 'a-1', input: { topic: 't' }, nextDue: 0 });
    expect(r.ok).toBe(true);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE scheduled_jobs'),
      expect.arrayContaining(['success', expect.any(Number), null, 1, 'j-1']),
    );
  });
  it('pipeline 失败 → !ok', async () => {
    (pool.query as any).mockResolvedValue({ rowCount: 1 });
    (botTrigger.findPipelinesForAgent as any).mockResolvedValue([{ id: 'p-1' }]);
    (botTrigger.triggerPipelineForBot as any).mockResolvedValue(null);
    const r = await runDueJob({ id: 'j-1', name: 'X', agentTemplateId: 'a-1', input: {}, nextDue: 0 });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('pipeline failed');
  });
});
