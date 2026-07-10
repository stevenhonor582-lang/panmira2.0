-- ============================================================================
-- R38 Stage 2: 数据回填 + 双向同步 + 修墨言数据矛盾
-- Spec: /home/ubuntu/panmira-N1/.claude/R38-MIGRATION-SPEC.md
-- Prereq: V023 (Stage 1 schema) - agent_id columns + agent_mcp_refs
-- Backup: /home/ubuntu/r38-backup-pre.sql (67MB, 2026-07-10)
-- ============================================================================

BEGIN;

-- 2.1 memories (memories.bot_id uuid,bot_configs.bot_id uuid)
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE memories m
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE m.bot_id = bc.bot_id
    AND m.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.1 memories backfill: % rows', cnt;
END $$;

-- 2.2 bot_secrets
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE bot_secrets bs
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE bs.bot_name = bc.name
    AND bs.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.2 bot_secrets backfill: % rows', cnt;
END $$;

-- 2.3 bot_budgets
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE bot_budgets bb
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE bb.bot_name = bc.name
    AND bb.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.3 bot_budgets backfill: % rows', cnt;
END $$;

-- 2.4 budget_history
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE budget_history bh
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE bh.bot_name = bc.name
    AND bh.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.4 budget_history backfill: % rows', cnt;
END $$;

-- 2.5 circuit_breaker_states
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE circuit_breaker_states cs
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE cs.bot_name = bc.name
    AND cs.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.5 circuit_breaker_states backfill: % rows', cnt;
END $$;

-- 2.6 activity_events (activity_events.bot_id uuid)
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE activity_events ae
  SET agent_id = bc.agent_id
  FROM bot_configs bc
  WHERE ae.bot_id = bc.bot_id
    AND ae.agent_id IS NULL
    AND bc.agent_id IS NOT NULL;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.6 activity_events backfill: % rows', cnt;
END $$;

-- 2.7 反向回填 bot_configs.agent_id (基于 agents.channel_ids)
--   R34-A 漏了一半: 不盈/信言/得一 3 个 bot_configs.agent_id=NULL
DO $$
DECLARE cnt integer;
BEGIN
  UPDATE bot_configs bc
  SET agent_id = a.id
  FROM agents a,
       LATERAL jsonb_array_elements_text(a.channel_ids) AS elem(bot_id_str)
  WHERE bc.bot_id::text = elem.bot_id_str
    AND bc.agent_id IS NULL
    AND jsonb_array_length(a.channel_ids) > 0;
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.7 bot_configs reverse backfill: % rows', cnt;
END $$;

-- 2.9 修墨言数据矛盾
-- 决策: model_id (d2e3c8c5... = 智谱 GLM provider, model='GLM-5.2') 与其他
--   template agent (守静/玄鉴) 一致 (都用 GLM)。
--   因此 model_id FK 是权威,defaultModel 文本是错的 (stale)。
--   修法: 改 defaultModel 为 'GLM-5.2' (匹配 model_id 指向的 provider.model)
DO $$
DECLARE cnt integer;
  old_model text;
  new_model text := 'GLM-5.2';
BEGIN
  SELECT default_model INTO old_model
  FROM agents
  WHERE name = '墨言--全能文案秘书';

  UPDATE agents
  SET default_model = new_model
  WHERE name = '墨言--全能文案秘书'
    AND default_model <> new_model;

  GET DIAGNOSTICS cnt = ROW_COUNT;
  RAISE NOTICE '2.9 墨言 fix: old=%, new=%, updated=% rows', old_model, new_model, cnt;
END $$;

COMMIT;
