-- Team Spec Stage 1 Task 5: scene_packs + scene_pack_experts schema

CREATE TABLE IF NOT EXISTS scene_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_type TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scene_pack_experts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_pack_id UUID NOT NULL REFERENCES scene_packs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('collect', 'analyze', 'produce', 'review')),
  expert_name TEXT NOT NULL,
  engine TEXT NOT NULL,
  prompt TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scene_pack_id, stage, position)
);

CREATE INDEX IF NOT EXISTS idx_scene_pack_experts_pack_stage
  ON scene_pack_experts(scene_pack_id, stage, position);

INSERT INTO scene_packs (scene_type, name, description) VALUES
  ('data', '数据场景', '采集 → 分析 → 产出 → 审查(数据分析/报告)'),
  ('content', '内容场景', '采集 → 分析 → 产出 → 审查(文章/选题)'),
  ('development', '开发场景', '采集 → 分析 → 产出 → 审查(代码/重构)')
ON CONFLICT (scene_type) DO NOTHING;
