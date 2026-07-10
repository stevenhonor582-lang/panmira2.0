-- R51-A · provider_configs 增加 model_category 字段
-- 用户拍板决策(2026-07-11):
--   - 加 model_category text not null default 'llm'
--   - 值域: 'llm' | 'embedding' | 'video' | 'audio' | 'rerank' | 'other'
--   - 现有 5 provider 按 type 标 category
--   - 后续创建/编辑表单允许选 category
-- 来源:任务 R51-A · 大模型路由/Fallback 概念讲清
BEGIN;

ALTER TABLE provider_configs
  ADD COLUMN IF NOT EXISTS model_category text NOT NULL DEFAULT 'llm';

-- 回填现有 5 行(type 是 embedding 的标 embedding,其余保持默认 llm)
UPDATE provider_configs
   SET model_category = 'embedding'
 WHERE type = 'embedding';

-- 容错:已知历史 embedding 类型名
UPDATE provider_configs
   SET model_category = 'embedding'
 WHERE lower(name) LIKE '%embedding%'
    OR lower(model) LIKE '%embedding%'
    OR lower(model) LIKE '%bge%';

COMMIT;
