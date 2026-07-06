-- 工单 9 (2026-07-06): provider_configs 加 contextWindow 字段
-- Layer 2: 数据库存储真实测量的 context window,优先于 hardcode

ALTER TABLE provider_configs ADD COLUMN IF NOT EXISTS context_window INT;

COMMENT ON COLUMN provider_configs.context_window IS '实际测量的 context window (tokens). NULL = 用 hardcode fallback';

-- 填实已知值
UPDATE provider_configs SET context_window = 1000000 WHERE name = '智谱 (GLM)';  -- GLM-5.2 官方 1M
UPDATE provider_configs SET context_window = 512000 WHERE name = 'MiniMax';  -- M3 实测 ~521K,512K 安全边距
UPDATE provider_configs SET context_window = 1000000 WHERE name = 'DeepSeek V4';
UPDATE provider_configs SET context_window = 200000 WHERE name = 'MiniMax-luoxuan';
