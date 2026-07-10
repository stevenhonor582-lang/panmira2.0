-- R48-W1 P1.4 测试数据清理(独立 commit,用户已授权)
-- 影响 160 行(backfill 123 + web 27 + __test_iso_user 4 + team-pipeline 3 + e2e-test 3)
-- 操作:标 invalidated + metadata_json.reason='test_data_cleanup_R48'
BEGIN;

WITH cleanup AS (
  UPDATE memories
  SET invalidated_at = NOW(),
      updated_at = NOW(),
      metadata_json = COALESCE(metadata_json, '{}'::jsonb) ||
                      jsonb_build_object('cleanup_reason', 'test_data_R48', 'cleanup_at', NOW()::text)
  WHERE user_id IN ('backfill', 'web', '__test_iso_user', 'team-pipeline', 'e2e-test')
    AND invalidated_at IS NULL
  RETURNING id
)
SELECT count(*) AS cleaned FROM cleanup;

COMMIT;

-- 验证
SELECT user_id, count(*) AS still_active
  FROM memories
  WHERE user_id IN ('backfill', 'web', '__test_iso_user', 'team-pipeline', 'e2e-test')
    AND invalidated_at IS NULL
  GROUP BY 1;
