# Team Spec 实施进度(2026-07-22)

> H00 北极星 + 8 项辅指标验收报告
> 跑法:`npm run build && node dist/scripts/verify-h00-metrics.js`

## 阶段完成度

| 阶段 | 状态 | 详情 |
|---|---|---|
| Stage 1 数据场景 MVP | ✅ | 7 task · 8 commit · 27 tests pass |
| Stage 2 engine 配置化 | ✅ | 5 task · 5 commit · 12 experts 填实 |
| Stage 3 多 bot 协作 + HooksGate | ✅ | 4 task · 5 commit · MultiBotOrchestrator |
| Stage 4 验收 | 🔄 进行中 | 工具就位,数据待收 |

## 当前验收状态(2026-07-22 跑)

```
=== H00 北极星 + 辅指标验收 ===

⏸ callback_count: NO DATA
⏸ incomplete_rate: NO DATA
⏸ task_duration_ms: NO DATA
⏸ orchestration_flexibility: NO DATA
❌ first_byte_ms: 212959.84 ms (line: < 3000) — 实测历史数据
⏸ memory_recall_accuracy: NO DATA
⏸ search_hit_rate: NO DATA
✅ pm2_restarts_per_day: 0.00 (line: < 1)

PASS: 1, FAIL: 1, NO_DATA: 6
```

**含义**:
- team_metrics 表空 → TeamPipeline 端到端还没在生产触发数据采集
- first_byte_ms 历史数据 fail → 平均 213s,远超 3s 阈值(这不是 team spec 引入的,是历史 activity_events 数据)
- pm2 稳定(0 重启/天)

## 验收窗口

- **deadline**:2026-07-31(还剩 9 天)
- **当前**:Stage 1+2+3 已落地,工具就位
- **待做**:
  1. 实网 WS 触发 TeamPipeline 端到端数据场景 → team_metrics 开始累积
  2. 跑 24h 窗口采 callback_count / incomplete_rate 等用户反馈数据
  3. 重跑验收脚本

## H00 北极星窗口

**任务完成质量 ≥ 80%** 待数据:
- A 硬指标(status=complete + 无 error):实网可测
- B 软指标(24h 无 👎 / 无重发同一问题):待飞书卡片 👎 按钮 + 24h 观察窗口

## 文件清单

- 验收脚本:`src/scripts/verify-h00-metrics.ts`
- 累计组件:Orchestrator / PipelineStage / MemoryBridge / ExpertSubagent / ScenePack / ReviewPanel / TeamPipeline / HooksGate / MultiBotOrchestrator / EngineConfig / ProviderRouter
- 总测试:38 tests pass
- 总 commit:19 commits (Stage 1+2+3+4 partial)
- 实网部署:pm2 panmira PID 23 online
