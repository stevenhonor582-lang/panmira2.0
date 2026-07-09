-- ┌──────────────────────────────────────────────────────────────────────────┐
-- │ R34-A: Bot-centric → Agent-centric 数据迁移                              │
-- │                                                                          │
-- │ 目标:                                                                    │
-- │   1. 每个旧 Bot 1:1 绑定到 Agent 实例（bot_configs.agent_id）            │
-- │   2. agents.channel_ids 填充（指向绑定的 bot_id 列表）                   │
-- │   3. folders / documents 归属迁移（通过 bot_configs 反查 agent_id）      │
-- │   4. 所有历史数据保留（bot_id 列不删，只加 agent_id 列）                 │
-- │                                                                          │
-- │ 备份: backups/pre-r34-migration-<timestamp>.sql (190MB)                  │
-- │ 幂等: 所有 UPDATE 都加了 IS NULL / IF NOT EXISTS 守卫，可重复执行        │
-- └──────────────────────────────────────────────────────────────────────────┘

BEGIN;

-- ═══ Step 1: 加 agent_id 列 ════════════════════════════════════════════════
-- bot_configs: 已有 agent_template_id (指向模板)，新加 agent_id (指向实例)
ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS agent_id uuid
  REFERENCES agents(id) ON DELETE SET NULL;

ALTER TABLE folders ADD COLUMN IF NOT EXISTS agent_id uuid
  REFERENCES agents(id) ON DELETE SET NULL;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS agent_id uuid
  REFERENCES agents(id) ON DELETE SET NULL;

-- ═══ Step 2: 填充 bot_configs.agent_id (人工核对的 1:1 映射) ════════════════
-- 数据来源:
--   bot_configs.display_name 揭示了 Bot 期望的 agent 角色
--   agents.name 用 "<bot_name>--<role>" 格式
--
-- 映射核对（5 bots → 5 agent 实例）:
--   不盈 (display="不盈--全栈开发")    → 不盈--全栈开发         (c5bf8d20...)  ✓ 名字直匹配
--   信言 (display="信言--内容创作")    → 墨言--全能文案秘书     (1634063d...)  ✓ 角色匹配（信言改名墨言，都是内容/文案角色）
--   守静 (display="守静--运维部署监控")→ 守静--运维部署模板     (1af80186...)  ✓ 名字直匹配
--   得一 (display="得一--随时替补")    → 得一--替补模板         (87d505cc...)  ✓ 名字直匹配
--   玄鉴 (display="玄鉴--数智底座管理")→ 玄鉴--数智底座模板     (0253fff5...)  ✓ 名字直匹配
-- 剩余未绑定 agent: 测试Bot--验证缝合 (efadf77d...) — 测试用，无需绑定 bot

UPDATE bot_configs SET agent_id = 'c5bf8d20-90f4-4780-95cc-ed866651b3c8'
  WHERE name = '不盈' AND agent_id IS NULL;

UPDATE bot_configs SET agent_id = '1634063d-5862-4230-93d3-1aa166ba0a1c'
  WHERE name = '信言' AND agent_id IS NULL;
  -- 注: 信言 bot 改名为 墨言 agent (display_name 都是内容创作角色)

UPDATE bot_configs SET agent_id = '1af80186-a5d4-4433-b5df-963f4f4bba4d'
  WHERE name = '守静' AND agent_id IS NULL;

UPDATE bot_configs SET agent_id = '87d505cc-2a37-4524-88d2-cb840aa41ee1'
  WHERE name = '得一' AND agent_id IS NULL;

UPDATE bot_configs SET agent_id = '0253fff5-5daf-42f4-8642-dd1f95251c53'
  WHERE name = '玄鉴' AND agent_id IS NULL;

-- ═══ Step 3: 填充 agents.channel_ids ════════════════════════════════════════
-- 每个 agent 实例的 channel_ids = 绑定到它的 bot_id 列表（text 数组的 jsonb）
-- 模板 agent (is_template=true) 不动 channel_ids
UPDATE agents a SET channel_ids = COALESCE((
  SELECT jsonb_agg(bc.bot_id::text ORDER BY bc.name)
  FROM bot_configs bc
  WHERE bc.agent_id = a.id
), '[]'::jsonb)
WHERE a.is_template = false;

-- ═══ Step 4: folders 归属迁移 ═══════════════════════════════════════════════
-- folders.bot_id → folders.agent_id（通过 bot_configs 反查）
UPDATE folders f SET agent_id = bc.agent_id
FROM bot_configs bc
WHERE f.bot_id = bc.bot_id
  AND bc.agent_id IS NOT NULL
  AND f.agent_id IS NULL;

-- ═══ Step 5: documents 归属迁移 ═════════════════════════════════════════════
-- documents.bot_id → documents.agent_id（通过 bot_configs 反查）
UPDATE documents d SET agent_id = bc.agent_id
FROM bot_configs bc
WHERE d.bot_id = bc.bot_id
  AND bc.agent_id IS NOT NULL
  AND d.agent_id IS NULL;

-- ═══ Step 6: 索引 ═══════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS bot_configs_agent_id_idx ON bot_configs(agent_id);
CREATE INDEX IF NOT EXISTS folders_agent_id_idx ON folders(agent_id);
CREATE INDEX IF NOT EXISTS documents_agent_id_idx ON documents(agent_id);

COMMIT;

-- ═══ 验证查询（不参与事务，迁移后跑） ═══════════════════════════════════════
-- SELECT 'bot_configs 有 agent_id' AS check,
--        count(*) FILTER (WHERE agent_id IS NOT NULL) || '/' || count(*) FROM bot_configs;
-- SELECT 'agents 有 channel_ids' AS check,
--        count(*) FILTER (WHERE channel_ids != '[]'::jsonb) || '/' || count(*)
--   FROM agents WHERE is_template = false;
-- SELECT 'folders 有 agent_id' AS check,
--        count(*) FILTER (WHERE agent_id IS NOT NULL) || '/' || count(*) FROM folders;
-- SELECT 'documents 有 agent_id' AS check,
--        count(*) FILTER (WHERE agent_id IS NOT NULL) || '/' || count(*) FROM documents;
