-- Verification harness fixtures (commit 1)
-- 4 probe memories for 得一 + 不盈 to test bot_id isolation
-- Idempotent via ON CONFLICT (id) DO NOTHING; marked __test_iso_ for easy cleanup
-- Cross-bot duplicate subject (__test_iso_common) is INTENTIONAL to seed S3 evidence

INSERT INTO memories (
  id, content, layer, user_id, tenant_id, bot_id,
  importance, confidence, subject_normalized,
  type, polarity, metadata_json
) VALUES
  ('__test_iso_a_private',
   '得一 私有测试事实: 隔离验证探针 A',
   2, '__test_iso_user', 'tenant:__test_iso',
   '092816d0-9ee8-48b0-b49e-7708fd390c7f',
   0.9, 0.95, '__test_iso_a_private',
   'fact', 'affirm', '{"__test_iso": true}'),
  ('__test_iso_common_a',
   '通用事实 A 版本: 跨 bot 重复入库测试',
   2, '__test_iso_user', 'tenant:__test_iso',
   '092816d0-9ee8-48b0-b49e-7708fd390c7f',
   0.9, 0.95, '__test_iso_common',
   'fact', 'affirm', '{"__test_iso": true}'),
  ('__test_iso_b_private',
   '不盈 私有测试事实: 隔离验证探针 B',
   2, '__test_iso_user', 'tenant:__test_iso',
   'fb2af5ea-ee86-4c43-ab71-214d40559a2e',
   0.9, 0.95, '__test_iso_b_private',
   'fact', 'affirm', '{"__test_iso": true}'),
  ('__test_iso_common_b',
   '通用事实 B 版本: 跨 bot 重复入库测试',
   2, '__test_iso_user', 'tenant:__test_iso',
   'fb2af5ea-ee86-4c43-ab71-214d40559a2e',
   0.9, 0.95, '__test_iso_common',
   'fact', 'affirm', '{"__test_iso": true}')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM memories WHERE id LIKE '__test_iso_%';
  RAISE NOTICE 'V019: __test_iso_* fixtures total = %', n;
END $$;
