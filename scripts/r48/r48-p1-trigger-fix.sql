-- R48-W1 P1.1 修复 l3_self_iterate trigger
-- 改前:trigger 只写 metadata_json->>'superseded_by',不更新 superseded_by FK 列;bot_id=NULL 时 WHERE 不匹配
-- 改后:同时写 FK 列,用 IS NOT DISTINCT FROM 兼容 NULL
-- 回滚:scripts/r48/r48-p1-trigger-rollback.sql

BEGIN;

CREATE OR REPLACE FUNCTION l3_self_iterate() RETURNS trigger AS $$
DECLARE
  old_id text;
BEGIN
  IF NEW.layer = 3 AND NEW.invalidated_at IS NULL AND NEW.superseded_by IS NULL THEN
    SELECT id INTO old_id
    FROM memories
    WHERE bot_id IS NOT DISTINCT FROM NEW.bot_id
      AND subject_normalized = NEW.subject_normalized
      AND layer IN (2, 3)
      AND invalidated_at IS NULL
      AND id <> NEW.id
    ORDER BY CASE WHEN layer = 3 THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1;

    IF old_id IS NOT NULL THEN
      UPDATE memories
      SET superseded_by = NEW.id,
          invalidated_at = NOW(),
          updated_at = NOW(),
          metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                          jsonb_build_object(
                            'superseded_at', NOW()::text,
                            'superseded_reason', 'new L3 with same subject_normalized'
                          )
      WHERE id = old_id;
      RAISE NOTICE 'L3 self-iteration: % invalidated, superseded by %', old_id, NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS memories_l3_self_iterate_trigger ON memories;
CREATE TRIGGER memories_l3_self_iterate_trigger
  BEFORE INSERT ON memories
  FOR EACH ROW EXECUTE FUNCTION l3_self_iterate();

COMMIT;

-- 验证
SELECT 'trigger func updated' AS check, prosrc LIKE '%superseded_by = NEW.id%' AS has_fk_write
  FROM pg_proc WHERE proname = 'l3_self_iterate';
SELECT 'trigger exists' AS check, tgname, tgenabled FROM pg_trigger WHERE tgname = 'memories_l3_self_iterate_trigger';
