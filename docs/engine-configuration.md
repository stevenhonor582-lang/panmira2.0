# Panmira Engine 配置化使用文档

> 创建:2026-07-06 · 状态:active

## 核心概念

Panmira = bot → engine → provider 三层抽象:
- bot_configs.provider_id 决定哪个 provider
- provider_configs 存 endpoint / api_key / is_default / type
- 改 provider = 改表,不改代码

已实锤(2026-07-05 工单 3):换 default LLM `GLM → MiniMax` = 一句 SQL,无需改代码。

## 当前默认配置

| 用途 | Provider | 来源 |
|---|---|---|
| 抽取 LLM | provider_configs.is_default = true | 当前 MiniMax (MiniMax-M3) |
| 对话 LLM | bot_configs.provider_id | bot 个别配置 (MiniMax-M3 / claude-opus-4-7) |
| 审查 LLM | 默认 = 对话 LLM | Task 6 ReviewPanel 默认走 reviewExpert.engine |

## 切换示例

### 切换 default LLM
```sql
UPDATE provider_configs SET is_default = (name = 'GLM') WHERE type IN ('LLM','openai','anthropic');
```

### 添加新 provider
```sql
INSERT INTO provider_configs (name, type, endpoint, api_key, is_default) VALUES
  ('NewProvider', 'anthropic', 'https://api.newprovider.com/v1', 'sk-...', false);
```

### 切换 bot 对话 LLM
```sql
UPDATE bot_configs
SET provider_id = (SELECT id FROM provider_configs WHERE name = 'claude-opus-4-7' LIMIT 1)
WHERE name = '得一';
```

## ScenePack engine 字段

scene_pack_experts.engine 字段独立指定,不同环节可用不同 provider:
```sql
INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'collect', '数据采集专家', 'minimax-m3', '你是数据采集专家', 1
FROM scene_packs sp WHERE sp.scene_type = 'data';
```

## Team Pipeline 引擎链路

TaskPipeline.execute(task)
  -> Orchestrator.identifyScene(task) -> sceneType
  -> ScenePackLoader.load(sceneType) -> ScenePack
  -> for each stage: ExpertSubagent(cfg, { bridge })
       -> MessageBridge.executeApiTask({ ..., sendCards: false })
            -> SDKCore session(走 provider_configs.api_key + baseUrl)
  -> ReviewPanel.review(produce, ctx)(默认单人审,critical=true 时 3 评审 majority)

关键:ExpertSubagent 不直接调 SDK,复用 MessageBridge.executeApiTask(已带 SDKCore session + resume + inputTokens fallback)。

## 相关文件

- src/orchestrator/orchestrator.ts - 场景识别
- src/agents/scene-pack-loader.ts - DB ScenePack loader
- src/agents/expert-subagent.ts - Expert(经 MessageBridge.executeApiTask)
- src/orchestrator/review-panel.ts - 默认单人审 / 关键任务会议制
- src/orchestrator/team-pipeline.ts - 4 环节串联
- src/db/migrations/2026-07-06-scene-packs.sql - scene_packs + scene_pack_experts schema
- src/memory/memory-bridge.ts - 写入 stage memory(按 scene_type 过滤)
