-- Stage 2 Task 8: 5 bot 各自 engine 绑定
-- 通过 bot_agent_history 关联(latest binding)

-- 玄鉴:minimax-m3(数智底座,便宜)
UPDATE agents SET engine = 'minimax-m3'
WHERE id IN (
  SELECT DISTINCT ON (bot_id) agent_id FROM bot_agent_history
  WHERE bot_id = (SELECT bot_id FROM bot_configs WHERE name = '玄鉴')
  ORDER BY bot_id, bound_at DESC
);

-- 其余 4 bot:claude-opus-4-7(对话/内容质量优先)
UPDATE agents SET engine = 'claude-opus-4-7'
WHERE id IN (
  SELECT DISTINCT ON (bot_id) agent_id FROM bot_agent_history
  WHERE bot_id IN (SELECT bot_id FROM bot_configs WHERE name IN ('得一', '不盈', '守静', '信言'))
  ORDER BY bot_id, bound_at DESC
);

COMMENT ON COLUMN agents.engine IS 'Engine 名,对应 provider_configs.name(2026-07-13 Stage 2 Task 8)';
