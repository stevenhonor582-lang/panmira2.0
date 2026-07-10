-- R49-B · 语义层 4 表(建表暂不接入)
-- 来源:.claude/R48-UPGRADE-IMPLEMENTATION-SPEC.md §3.1
-- 用户决策(2026-07-10):语义层 4 表 → 建表暂不接入,等 R49 块 C/D 阶段再 wire
-- 设计:纯增量,**不删任何 KB/document/memory 表**

BEGIN;

-- 1. semantic_assets: 语义资产主表(一个 asset = 一个语义单元)
CREATE TABLE IF NOT EXISTS semantic_assets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  team_id         uuid,
  owner_user_id   uuid,
  -- 双轨 type
  type            varchar(40) NOT NULL CHECK (type IN (
                    'knowledge','skill','memory','agent','feedback',
                    'document','pipeline','template','metric'
                  )),
  -- semantic_kind: 更细分类
  semantic_kind   varchar(40),
  name            varchar(200) NOT NULL,
  description     text,
  -- 双向引用:指向原表的源行
  source_table    varchar(60) NOT NULL,
  source_id       text NOT NULL,
  source_url      text,
  -- 语义指纹
  content_hash    text NOT NULL,
  embedding       vector(1024),
  embedding_model varchar(60),
  embedding_at    timestamptz,
  -- 治理字段
  visibility      varchar(20) DEFAULT 'team' CHECK (visibility IN ('private','team','company')),
  quality_score   real DEFAULT 0,
  hit_count       integer DEFAULT 0,
  last_hit_at     timestamptz,
  tags            jsonb DEFAULT '[]'::jsonb,
  metadata        jsonb DEFAULT '{}'::jsonb,
  status          varchar(20) DEFAULT 'active' CHECK (status IN ('active','deprecated','archived')),
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (source_table, source_id, type)
);

CREATE INDEX IF NOT EXISTS idx_sa_type_kind ON semantic_assets (type, semantic_kind) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sa_team      ON semantic_assets (team_id)                WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sa_hit       ON semantic_assets (hit_count DESC)         WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sa_quality   ON semantic_assets (quality_score DESC)     WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sa_updated   ON semantic_assets (updated_at DESC)        WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_sa_embedding ON semantic_assets
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 2. semantic_versions: 版本表(同一 asset 的多个版本)
CREATE TABLE IF NOT EXISTS semantic_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id        uuid NOT NULL REFERENCES semantic_assets(id) ON DELETE CASCADE,
  version         integer NOT NULL,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  embedding       vector(1024),
  diff_from_prev  text,
  change_reason   varchar(40),
  changed_by      uuid,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (asset_id, version)
);

CREATE INDEX IF NOT EXISTS idx_sv_asset_version ON semantic_versions (asset_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_sv_embedding     ON semantic_versions
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- 3. semantic_relations: 关系表(关联、依赖、相似、冲突)
CREATE TABLE IF NOT EXISTS semantic_relations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  from_asset_id   uuid NOT NULL REFERENCES semantic_assets(id) ON DELETE CASCADE,
  to_asset_id     uuid NOT NULL REFERENCES semantic_assets(id) ON DELETE CASCADE,
  relation_type   varchar(40) NOT NULL CHECK (relation_type IN (
                    'related','depends_on','supersedes','conflicts_with',
                    'derives_from','example_of','part_of','evaluated_by'
                  )),
  weight          real DEFAULT 1.0 CHECK (weight BETWEEN 0 AND 1),
  confidence      real DEFAULT 0.8,
  source          varchar(40),
  evidence        jsonb DEFAULT '{}'::jsonb,
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  CHECK (from_asset_id <> to_asset_id),
  UNIQUE (from_asset_id, to_asset_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_sr_from ON semantic_relations (from_asset_id);
CREATE INDEX IF NOT EXISTS idx_sr_to   ON semantic_relations (to_asset_id);
CREATE INDEX IF NOT EXISTS idx_sr_type ON semantic_relations (relation_type);

-- 4. semantic_injection_rules: 注入规则
CREATE TABLE IF NOT EXISTS semantic_injection_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  name            varchar(200) NOT NULL,
  description     text,
  trigger_when    jsonb NOT NULL DEFAULT '{}'::jsonb,
  asset_filter    jsonb NOT NULL DEFAULT '{}'::jsonb,
  injection_mode  varchar(20) DEFAULT 'system_prompt' CHECK (injection_mode IN (
                    'system_prompt','user_message','function_call','context_append'
                  )),
  priority        integer DEFAULT 100,
  max_assets      integer DEFAULT 5,
  min_score       real DEFAULT 0.5,
  enabled         boolean DEFAULT true,
  hit_count       integer DEFAULT 0,
  helpful_count   integer DEFAULT 0,
  harmful_count   integer DEFAULT 0,
  last_evaluated_at timestamptz,
  created_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sir_enabled ON semantic_injection_rules (enabled, priority);
CREATE INDEX IF NOT EXISTS idx_sir_tenant  ON semantic_injection_rules (tenant_id);

COMMIT;
