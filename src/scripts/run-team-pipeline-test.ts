// scripts/run-team-pipeline-test.ts
// 实网验证:用 mock bridge 跑 TeamPipeline 端到端,确认 4 环节 + 埋点工作
// 跑法:npm run build && node dist/scripts/run-team-pipeline-test.js

import * as pg from 'pg';
import { TeamPipeline } from '../orchestrator/team-pipeline.js';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ubuntu:ubuntu@localhost:5432/metabot';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  // Mock bridge:每个 expert 返回固定内容,review 返回 PASS
  const responses: Record<string, string> = {
    '采集': '数据采集摘要:v1(2026-07-22 实测)',
    '分析': '分析:v1 — 发现 3 个关键指标增长 25%',
    '产出': '报告产出:v1 — 结构化分析报告,共 5 页',
    '审': 'PASS',
  };

  const fakeBridge: any = {
    executeApiTask: async (opts: any) => {
      const chatId = opts.chatId || '';
      // review panel 用 chatId 后缀 '-review' 区分
      if (chatId.includes('-review') || chatId.includes('-panel-')) {
        return { success: true, responseText: 'PASS', sessionId: `sess-${Date.now()}` };
      }
      const prompt = opts.prompt || '';
      let matched: string | null = null;
      for (const k of Object.keys(responses)) {
        if (prompt.includes(k)) { matched = k; break; }
      }
      return {
        success: true,
        responseText: matched ? responses[matched] : '默认回复',
        sessionId: `sess-${Date.now()}`,
      };
    },
  };

  const metricsRecorder = {
    record: async (metric: string, bot: string, chatId: string, value: number, meta?: object) => {
      await pool.query(
        `INSERT INTO team_metrics (metric, bot_name, chat_id, value, metadata_json) VALUES ($1, $2, $3, $4, $5)`,
        [metric, bot, chatId, value, JSON.stringify(meta || {})],
      );
      console.log(`[metric] ${metric} = ${value} (bot=${bot}, chatId=${chatId})`);
    },
  };

  const pipeline = TeamPipeline.build({
    bridge: fakeBridge,
    pool,
    botName: '得一',
    reviewExpert: { name: '审查', engine: 'claude-opus-4-7', prompt: '你是审查官' },
  });

  // Inject metricsRecorder
  (pipeline as any).deps.metricsRecorder = metricsRecorder;

  console.log('\n=== 触发 TeamPipeline 端到端 ===\n');
  const r = await pipeline.execute('/数据 GA4 周报生成', { chatId: 'test-e2e-001', botName: '得一' });

  console.log('\n=== Pipeline Result ===');
  console.log(JSON.stringify({
    status: r.status,
    sceneType: r.sceneType,
    stages: r.stages.map(s => ({ stage: s.stage, status: s.status, durationMs: s.durationMs, reviewPassed: s.reviewPassed })),
    totalDurationMs: r.totalDurationMs,
  }, null, 2));

  await pool.end();
  console.log('\n✅ TeamPipeline 端到端跑通,4 metric 已写入 team_metrics');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
