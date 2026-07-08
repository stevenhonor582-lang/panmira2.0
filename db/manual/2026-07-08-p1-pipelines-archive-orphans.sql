-- P1 收尾 · 历史 e2e/test 遗留的 3 个 agent_pipelines 无主 id 清理
-- 执行时间: 2026-07-08
-- 操作: 接管到史德飞 + 标记 archived
-- 结果: owner_id IS NULL = 0, status='archived' = 3

BEGIN;

UPDATE agent_pipelines
SET
  owner_id = (SELECT id FROM users WHERE email = '20218181@qq.com' LIMIT 1),
  status = 'archived'
WHERE owner_id IS NULL;

-- 验证(commit 前)
SELECT
  count(*) FILTER (WHERE owner_id IS NULL) AS still_no_owner,
  count(*) FILTER (WHERE status = 'archived') AS archived_count,
  count(*) AS total
FROM agent_pipelines;
-- 期望: 0 / 3 / 13

COMMIT;

-- 后续验证(commit 后)
-- SELECT name, owner_id IS NOT NULL AS has_owner, status, created_at
-- FROM agent_pipelines
-- WHERE name IN ('e2e real llm test', 'e2e parallel+retry test', 'L6 Test Pipeline');
-- 期望: 3 行, owner_id != NULL, status = 'archived'

-- 来源 pipelines (历史 e2e + L6 测试):
--   140c8b32-f638-42e2-b5f2-740895d6a215 | e2e real llm test       | 2026-07-07 12:17:44
--   d3a58b5e-b4bf-4c9a-b326-ce378c36f505 | e2e parallel+retry test | 2026-07-07 13:06:36
--   12ce1fdb-d514-4e25-b529-6dd8e42aa9cb | L6 Test Pipeline        | 2026-07-07 18:01:30