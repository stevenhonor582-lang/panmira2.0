-- ============================================================================
-- panmira A1 — 用户表扩展 (2026-07-08)
-- ============================================================================
-- 新增:
--   phone               varchar(32)    可空 + unique
--   sid                 varchar(64)    unique,格式 metmira:<handle>
--   verification_code   varchar(8)     登录二次验证码
--   code_expires_at     timestamp      验证码过期时间
--   failed_attempts     int default 0  失败计数
--   locked_until        timestamp      锁定到期时间
--   role 扩展为 admin / operator / member(CHECK 约束,因为 DB 里是 TEXT)
--
-- 兼容性:
--   1) 已存在用户无 sid → 从 email/name 派生 metmira:<handle>
--   2) 已存在 admin 保留为 admin,member 升级为 operator
-- ============================================================================

-- 1. 加 phone / sid / 登录控制列
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32);
ALTER TABLE users ADD COLUMN IF NOT EXISTS sid VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code VARCHAR(8);
ALTER TABLE users ADD COLUMN IF NOT EXISTS code_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 2. 回填 sid = 'metmira:<handle>'
DO $$
DECLARE
  rec RECORD;
  base_handle TEXT;
  candidate TEXT;
  suffix INT;
  existing_count INT;
BEGIN
  FOR rec IN SELECT id, email, name FROM users WHERE sid IS NULL LOOP
    IF rec.email IS NOT NULL AND rec.email <> '' THEN
      base_handle := lower(split_part(rec.email, '@', 1));
      base_handle := regexp_replace(base_handle, '[^a-z0-9]+', '_', 'g');
      base_handle := trim(BOTH '_' FROM base_handle);
    ELSE
      base_handle := lower(rec.name);
      base_handle := regexp_replace(base_handle, '[^a-z0-9]+', '-', 'g');
      base_handle := trim(BOTH '-' FROM base_handle);
    END IF;

    IF base_handle = '' OR base_handle IS NULL THEN
      base_handle := 'user';
    END IF;

    candidate := 'metmira:' || base_handle;
    suffix := 0;

    LOOP
      SELECT count(*) INTO existing_count
        FROM users WHERE sid = candidate AND id <> rec.id;
      EXIT WHEN existing_count = 0;
      suffix := suffix + 1;
      candidate := 'metmira:' || base_handle || '-' || suffix;
    END LOOP;

    UPDATE users SET sid = candidate WHERE id = rec.id;
  END LOOP;
END $$;

-- 3. sid NOT NULL + unique
ALTER TABLE users ALTER COLUMN sid SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'users'
       AND indexname  = 'users_sid_key'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_sid_key UNIQUE (sid);
  END IF;
END $$;

-- 4. phone unique(部分索引,允许多个 NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'users'
       AND indexname  = 'users_phone_key'
  ) THEN
    CREATE UNIQUE INDEX users_phone_key ON users(phone) WHERE phone IS NOT NULL;
  END IF;
END $$;

-- 5. role 列扩展:加 CHECK 约束(DB 是 TEXT,不用真 enum)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin', 'operator', 'member'));
  END IF;
END $$;

-- 6. 已存在用户角色迁移:member → operator,admin 保留
UPDATE users SET role = 'operator' WHERE role = 'member';

-- 7. role default 改为 member
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'member';

-- 8. 触发器:阻止最后一个 admin 降级
CREATE OR REPLACE FUNCTION ensure_minimum_admin() RETURNS TRIGGER AS $$
DECLARE
  admin_count INT;
BEGIN
  IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    SELECT count(*) INTO admin_count FROM users WHERE role = 'admin' AND is_active = true AND id <> OLD.id;
    IF admin_count = 0 THEN
      RAISE EXCEPTION 'cannot_remove_last_admin: at least one active admin required';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_min_admin ON users;
CREATE TRIGGER trg_ensure_min_admin
  BEFORE UPDATE OF role ON users
  FOR EACH ROW EXECUTE FUNCTION ensure_minimum_admin();

-- 9. 触发器:阻止删最后一个 admin
CREATE OR REPLACE FUNCTION block_last_admin_delete() RETURNS TRIGGER AS $$
DECLARE
  admin_count INT;
BEGIN
  IF OLD.role = 'admin' THEN
    SELECT count(*) INTO admin_count FROM users WHERE role = 'admin' AND id <> OLD.id;
    IF admin_count = 0 THEN
      RAISE EXCEPTION 'cannot_delete_last_admin: at least one admin must remain';
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_block_last_admin_delete ON users;
CREATE TRIGGER trg_block_last_admin_delete
  BEFORE DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION block_last_admin_delete();

-- 10. 索引
CREATE INDEX IF NOT EXISTS idx_users_sid ON users(sid);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) WHERE locked_until IS NOT NULL;

-- 11. 记录迁移
INSERT INTO _migration_log (migration_name, details) VALUES (
  '2026_07_08_a1_users',
  jsonb_build_object(
    'description', 'A1: users table extended (phone, sid, role check, verification_code, lock fields)',
    'role_values', ARRAY['admin','operator','member'],
    'sid_format', 'metmira:<handle>',
    'lockout_after_failures', 5,
    'lockout_minutes', 30,
    'verification_code_ttl_seconds', 300
  )
) ON CONFLICT (migration_name) DO NOTHING;
