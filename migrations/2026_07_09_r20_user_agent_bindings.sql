-- 2026_07_09_r20_user_agent_bindings.sql
-- P1·人机协同：真人员工(users) × 数字员工(agents) 绑定关系表
-- 对应 PRD-v2 第 4.9（人机协同核心）+ 第 6.3（数据缺口）
-- 设计：方案 B（新表，一人多 agent + 角色属性）

CREATE TABLE IF NOT EXISTS public.user_agent_bindings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    user_id uuid NOT NULL,                   -- 真人员工 → users.id
    agent_id uuid NOT NULL,                  -- 数字员工 → agents.id
    role text NOT NULL DEFAULT 'user',       -- owner(负责) / user(使用) / approver(审批)
    is_primary boolean DEFAULT false,        -- 该用户的主 agent
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT fk_uab_user   FOREIGN KEY (user_id)  REFERENCES public.users(id)  ON DELETE CASCADE,
    CONSTRAINT fk_uab_agent  FOREIGN KEY (agent_id) REFERENCES public.agents(id) ON DELETE CASCADE,
    CONSTRAINT chk_uab_role  CHECK (role IN ('owner','user','approver'))
);

CREATE INDEX idx_uab_user   ON public.user_agent_bindings(user_id);
CREATE INDEX idx_uab_agent  ON public.user_agent_bindings(agent_id);
CREATE INDEX idx_uab_tenant ON public.user_agent_bindings(tenant_id);
CREATE UNIQUE INDEX uq_uab  ON public.user_agent_bindings(tenant_id, user_id, agent_id, role);

-- 回滚：DROP TABLE IF EXISTS public.user_agent_bindings;
