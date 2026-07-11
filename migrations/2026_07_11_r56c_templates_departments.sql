-- R56-C · 岗位类型扩展 + 部门 DB 改造
-- 决策:
--   1. agent_templates.template_type 加 engineering(工程型)、research(研究型)
--      共 6 类:painting(创意)/copywriting(文书)/ops(运营)/business(业务)/engineering(工程)/research(研究)
--   2. 加 secondary_template_types text[] 多选字段(可同时属于多类)
--   3. 新建 departments 表(系统 19 部门 + 研究 = 20,custom 不限)
--   4. agent_templates 加 department_id FK (SET NULL 防误删)
-- 严禁:不要碰 A/B/D agent 范围、不要回退 R36-R55

BEGIN;

-- ============================================================
-- Part 1: agent_templates.template_type 扩展
-- ============================================================

-- 1a. 加 secondary_template_types text[] 多选
ALTER TABLE agent_templates
  ADD COLUMN IF NOT EXISTS secondary_template_types text[] NOT NULL DEFAULT '{}'::text[];

-- 1b. 重写 template_type CHECK 约束(允许 6 类 + 兼容历史值)
ALTER TABLE agent_templates
  DROP CONSTRAINT IF EXISTS chk_template_type;
ALTER TABLE agent_templates
  ADD CONSTRAINT chk_template_type CHECK (
    template_type IS NULL OR template_type IN (
      'painting',
      'copywriting',
      'ops',
      'business',
      'engineering',
      'research',
      'custom', 'standard', '业务', 'full-stack-engineer'
    )
  );

-- 1c. secondary_template_types 元素校验触发器
CREATE OR REPLACE FUNCTION chk_secondary_template_types()
RETURNS TRIGGER AS $fn$
BEGIN
  IF NEW.secondary_template_types IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.secondary_template_types) AS t
      WHERE t NOT IN ('painting','copywriting','ops','business','engineering','research')
    ) THEN
      RAISE EXCEPTION 'secondary_template_types contains invalid value';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chk_secondary_template_types ON agent_templates;
CREATE TRIGGER trg_chk_secondary_template_types
  BEFORE INSERT OR UPDATE ON agent_templates
  FOR EACH ROW
  EXECUTE FUNCTION chk_secondary_template_types();

-- ============================================================
-- Part 2: departments 表
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  color varchar(20) DEFAULT '#64748b',
  source varchar(20) NOT NULL DEFAULT 'custom'
    CHECK (source IN ('system', 'custom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dept_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dept_source ON departments(source);

-- ============================================================
-- Part 3: agent_templates 加 department_id FK
-- ============================================================

ALTER TABLE agent_templates
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tpl_dept ON agent_templates(department_id);

-- ============================================================
-- Part 4: Seed 20 个系统部门 (tenant_id = NULL,全租户共享)
-- ============================================================

INSERT INTO departments (name, color, source) VALUES
  ('工程',     '#2563eb', 'system'),
  ('设计',     '#ec4899', 'system'),
  ('营销',     '#f97316', 'system'),
  ('付费媒体', '#f97316', 'system'),
  ('销售',     '#eab308', 'system'),
  ('财务',     '#22c55e', 'system'),
  ('HR',       '#a855f7', 'system'),
  ('法务',     '#6366f1', 'system'),
  ('供应链',   '#a16207', 'system'),
  ('产品',     '#06b6d4', 'system'),
  ('项目管理', '#2563eb', 'system'),
  ('测试',     '#64748b', 'system'),
  ('支持',     '#0d9488', 'system'),('专项',     '#6b7280', 'system'),
  ('空间计算', '#be185d', 'system'),
  ('游戏开发', '#991b1b', 'system'),
  ('学术',     '#1e3a8a', 'system'),
  ('GIS',      '#0891b2', 'system'),
  ('安全',     '#dc2626', 'system'),
  ('研究',     '#8b5cf6', 'system')
ON CONFLICT (tenant_id, name) DO NOTHING;

COMMIT;