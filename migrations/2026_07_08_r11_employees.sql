-- ============================================================================
-- panmira R11 — 组织部重构 (2026-07-08)
-- ============================================================================
-- 改动:
--   1. 加 department / position / employee_status 字段
--   2. employee_status CHECK 约束 (active/paused/departed/deleted)
--   3. SID 格式迁移 metmira:<handle> → MS-XXXXXX (base32, 排除 0/O/I/1)
--   4. 史德飞特殊处理 (MS-SHIDFE / 创始团队 / 创始人)
--   5. 其他用户补默认部门
--
-- 区分:
--   is_active         登录开关 (账号启用/禁用, 管理员手动)
--   employee_status   雇佣状态 (active/paused/departed/deleted)
--   locked_until      登录锁定 (系统自动, 防暴力)
-- ============================================================================

BEGIN;

-- 1. 加新字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS department varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS position varchar(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_status varchar(20) NOT NULL DEFAULT 'active';

-- 2. CHECK 约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_status_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_status_check
      CHECK (employee_status IN ('active','paused','departed','deleted'));
  END IF;
END $$;

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_users_employee_status ON users(employee_status);

-- 4. 现有用户全部置 active
UPDATE users SET employee_status = 'active'
WHERE employee_status IS NULL OR employee_status = '';

-- 5. SID 迁移 metmira:<handle> → MS-XXXXXX
--    用 gen_random_bytes 生成 hex, translate 到安全字母表 (排除 0/O/I/1)
--    每个用户循环生成, 直到无冲突
DO $$
DECLARE
  rec RECORD;
  new_sid TEXT;
  attempts INT;
BEGIN
  FOR rec IN SELECT id, email FROM users
             WHERE sid LIKE 'metmira:%' OR sid NOT LIKE 'MS-%' LOOP
    -- 史德飞特别处理 (固定易记 SID)
    IF rec.email = '20218181@qq.com' THEN
      new_sid := 'MS-SHIDFE';
      UPDATE users SET sid = new_sid WHERE id = rec.id;
      CONTINUE;
    END IF;

    attempts := 0;
    LOOP
      new_sid := 'MS-' || upper(substr(
        translate(encode(gen_random_bytes(12), 'hex'),
                  '0123456789abcdef',
                  'ABCDEFGHJKMNPQRSTUVWXYZ23456789'),
        1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE sid = new_sid AND id <> rec.id);
      attempts := attempts + 1;
      EXIT WHEN attempts > 20;
    END LOOP;

    UPDATE users SET sid = new_sid WHERE id = rec.id;
  END LOOP;
END $$;

-- 6. 史德飞补部门/职位
UPDATE users
SET department = '创始团队', position = '创始人'
WHERE email = '20218181@qq.com';

-- 7. Panmira Admin 默认部门
UPDATE users
SET department = COALESCE(department, '平台运维'),
    position   = COALESCE(position, '系统管理员')
WHERE email = 'admin@panmira.com' AND department IS NULL;

-- 8. Op One / Mem One / E2E 补默认部门
UPDATE users
SET department = COALESCE(department, '运营部'),
    position   = COALESCE(position, '操作员')
WHERE email = 'op1@panmira.com' AND department IS NULL;

UPDATE users
SET department = COALESCE(department, '运营部'),
    position   = COALESCE(position, '成员')
WHERE email IN ('mem1@panmira.com', 'e2e-test-member@panmira.com')
  AND department IS NULL;

-- 9. 其他用户兜底
UPDATE users
SET department = COALESCE(department, '未分配'),
    position   = COALESCE(position, '员工')
WHERE department IS NULL;

-- 10. 记录 migration
INSERT INTO _migration_log (migration_name, details)
  SELECT '2026_07_08_r11_employees',
         jsonb_build_object(
           'description', 'R11: users extended (department, position, employee_status) + SID format MS-XXXXXX',
           'employee_status_values', ARRAY['active','paused','departed','deleted'],
           'sid_format', 'MS-XXXXXX (base32, excludes 0/O/I/1)',
           'distinguish', 'is_active=登录开关, employee_status=雇佣状态, locked_until=登录锁定',
           'founder_sid', 'MS-SHIDFE'
         )
  WHERE NOT EXISTS (
    SELECT 1 FROM _migration_log WHERE migration_name = '2026_07_08_r11_employees'
  );

COMMIT;
