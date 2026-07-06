-- Phase β: 加 bot_configs.english_slug 字段
-- 用于 SDK cwd 隔离（PoC D 验证）
-- panmira 1.0 工作目录用中文（得一/玄鉴/...），SDK 编码后坍缩到同一目录
-- panmira 2.0 用英文 slug 隔离，避免 SDK projectKey 冲突

ALTER TABLE bot_configs ADD COLUMN IF NOT EXISTS english_slug VARCHAR(64);

-- 初始化 5 bot 的 english_slug
UPDATE bot_configs SET english_slug = 'deyi' WHERE name = '得一' AND english_slug IS NULL;
UPDATE bot_configs SET english_slug = 'xuanjian' WHERE name = '玄鉴' AND english_slug IS NULL;
UPDATE bot_configs SET english_slug = 'buying' WHERE name = '不盈' AND english_slug IS NULL;
UPDATE bot_configs SET english_slug = 'shoujing' WHERE name = '守静' AND english_slug IS NULL;
UPDATE bot_configs SET english_slug = 'xinyan' WHERE name = '信言' AND english_slug IS NULL;

-- 验证
DO $$
DECLARE
  missing_count int;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM bot_configs
  WHERE is_active = true AND english_slug IS NULL;
  
  IF missing_count > 0 THEN
    RAISE NOTICE 'V021 WARNING: % active bots missing english_slug', missing_count;
  ELSE
    RAISE NOTICE 'V021 OK: all active bots have english_slug';
  END IF;
END $$;
