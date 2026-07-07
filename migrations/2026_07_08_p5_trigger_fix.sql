-- ============================================================================
-- panmira P5 — 修复 trg_protect_last_admin 阻止所有 UPDATE 的 bug
-- ============================================================================
-- Bug 触发: A1 后 step1+step2 登录失败 (verificationCode 永远 invalid)
-- 根因: protect_last_admin() BEFORE UPDATE 触发器无脑返回 OLD,
--       PostgreSQL 在 BEFORE 触发器返回 OLD 时静默丢弃整个 UPDATE,
--       不只是阻止降级。
-- 影响: 所有 users 表 UPDATE 静默失败 (verification_code / failed_attempts / phone 等)
-- 发现: 2026-07-08 P5 E2E 测试 (登录 step1+step2 全 invalid_verification_code)
-- 修复: 区分 DELETE / UPDATE-role-change / 普通 UPDATE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  admin_count integer;
BEGIN
  -- 只在以下情况阻止:
  --   1) DELETE admin
  --   2) UPDATE 把 admin 改成非 admin (role IS DISTINCT FROM 'admin')
  IF OLD.role = 'admin'
     AND (TG_OP = 'DELETE'
          OR (TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM 'admin')) THEN
    SELECT count(*) INTO admin_count
      FROM users
     WHERE role = 'admin' AND id != OLD.id AND is_active = true;
    IF admin_count = 0 THEN
      RAISE EXCEPTION 'cannot delete or demote the last admin (block by trigger)';
    END IF;
  END IF;

  -- DELETE 保留返回 OLD 语义;UPDATE 必须返回 NEW 否则数据丢失
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- 不需要 DROP/CREATE TRIGGER,函数替换即可
