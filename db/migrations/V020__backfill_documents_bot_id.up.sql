-- P4-prime 2026-07-04: 回填 documents.bot_id 从 folder.bot_id
-- 修前 1095/2521 documents.bot_id IS NULL, 因 createBotDoc 不传 bot_id
-- 修后 createDocument 用 COALESCE 自动继承 (V020 配套 write-side fix)
-- 公共区/群协作区 folder.bot_id IS NULL → 这些 doc 仍 NULL (符合"无主"语义)

DO $$
DECLARE
  before_count int;
  after_count int;
  updated_count int;
BEGIN
  SELECT COUNT(*) INTO before_count FROM documents WHERE bot_id IS NULL;
  
  UPDATE documents d
     SET bot_id = f.bot_id
    FROM folders f
   WHERE d.folder_id = f.id
     AND d.bot_id IS NULL
     AND f.bot_id IS NOT NULL;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  SELECT COUNT(*) INTO after_count FROM documents WHERE bot_id IS NULL;
  
  RAISE NOTICE 'V020 backfill: before=%, updated=%, after=%', before_count, updated_count, after_count;
END $$;
