-- R68-2 · 块 7: 技能表加 personal_user_id (个人限定 scope)
-- NULL = 全局(SDK 自带 / 系统内置);非空 = 仅该用户可见/可用
ALTER TABLE skills
  ADD COLUMN IF NOT EXISTS personal_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS skills_personal_user_id_idx ON skills(personal_user_id);
