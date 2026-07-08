-- R15-A: agents 加 is_template + working_dir + channel_ids + visibility + temperature
-- 区分 agent 实例 vs 模板, 补 working_dir/channel_ids/visibility/temperature 字段
BEGIN;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS working_dir text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS channel_ids jsonb NOT NULL DEFAULT '[]';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS visibility varchar(20) NOT NULL DEFAULT 'team';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS temperature double precision NOT NULL DEFAULT 0.7;

CREATE INDEX IF NOT EXISTS idx_agents_is_template ON agents(is_template);

UPDATE agents SET is_template = false WHERE is_template IS NULL;
UPDATE agents SET is_template = true WHERE name = 'full-stack-engineer';
UPDATE agents
   SET working_dir = '/workspace/agents/' || id::text
 WHERE working_dir IS NULL
   AND is_template = false;
COMMIT;
