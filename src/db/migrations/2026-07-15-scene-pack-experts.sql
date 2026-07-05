-- Stage 2 Task 12: 填实 3 场景 × 4 环节 = 12 expert

-- 数据场景:采集用 minimax-m3(便宜),分析/产出/审查用 claude-opus-4-7(高质量)
INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'collect', '数据采集专家', 'minimax-m3', '你是数据采集专家,负责从 GA4/GSC/数据源拉取原始数据。', 1
FROM scene_packs sp WHERE sp.scene_type = 'data';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'analyze', '数据分析专家', 'claude-opus-4-7', '你是数据分析专家,基于采集数据做统计分析、趋势识别、异常发现。', 1
FROM scene_packs sp WHERE sp.scene_type = 'data';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'produce', '报告产出专家', 'claude-opus-4-7', '你是报告产出专家,把分析结果生成结构化报告。', 1
FROM scene_packs sp WHERE sp.scene_type = 'data';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'review', '数据审查官', 'claude-opus-4-7', '你是数据审查官,审查产出是否合规、数据是否准确、是否回答用户问题。', 1
FROM scene_packs sp WHERE sp.scene_type = 'data';

-- 内容场景:全部 claude-opus-4-7(文案质量优先)
INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'collect', '内容选题专家', 'claude-opus-4-7', '你是内容选题专家,从趋势/竞品/用户反馈中找选题。', 1
FROM scene_packs sp WHERE sp.scene_type = 'content';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'analyze', '内容大纲专家', 'claude-opus-4-7', '你是内容大纲专家,把选题拆解成结构化大纲。', 1
FROM scene_packs sp WHERE sp.scene_type = 'content';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'produce', '内容写作专家', 'claude-opus-4-7', '你是内容写作专家,基于大纲产出完整文案。', 1
FROM scene_packs sp WHERE sp.scene_type = 'content';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'review', '内容编辑', 'claude-opus-4-7', '你是内容编辑,审查文案质量、合规、风格一致性。', 1
FROM scene_packs sp WHERE sp.scene_type = 'content';

-- 开发场景:产出用 claude-opus-4-7(代码质量),采集/分析/审查用 minimax-m3(便宜)
INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'collect', '代码采集专家', 'minimax-m3', '你是代码采集专家,从代码库拉取相关代码、文档、需求。', 1
FROM scene_packs sp WHERE sp.scene_type = 'development';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'analyze', '架构分析专家', 'minimax-m3', '你是架构分析专家,分析需求、设计架构、识别风险。', 1
FROM scene_packs sp WHERE sp.scene_type = 'development';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'produce', '代码实现专家', 'claude-opus-4-7', '你是代码实现专家,基于架构产出高质量代码。', 1
FROM scene_packs sp WHERE sp.scene_type = 'development';

INSERT INTO scene_pack_experts (scene_pack_id, stage, expert_name, engine, prompt, position)
SELECT sp.id, 'review', '代码审查官', 'minimax-m3', '你是代码审查官,审查代码质量、安全、可测试性。', 1
FROM scene_packs sp WHERE sp.scene_type = 'development';
