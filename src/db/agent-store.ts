import { pool } from './index.js';

/**
 * R27 规则 1: 中文→拼音首字母 + 工作目录自动生成。
 * 不依赖完整拼音库,首字母够用(工作目录只求唯一 + 可读)。
 * 中文名→拼音首字母(不盈→by, 墨言→my, 守静→sj);英文/数字原样小写;符号忽略。
 */
const PINYIN_INITIAL: Record<string, string> = {
  '不': 'b', '盈': 'y', '墨': 'm', '言': 'y', '守': 's', '静': 'j',
  '得': 'd', '一': 'y', '玄': 'x', '鉴': 'j', '全': 'q', '栈': 'z',
  '文': 'w', '案': 'a', '运': 'y', '维': 'w', '替': 't', '补': 'b',
  '阿': 'a', '艾': 'a', '安': 'a', '奥': 'a',
  '巴': 'b', '白': 'b', '包': 'b', '宝': 'b', '贝': 'b', '毕': 'b', '薄': 'b', '卜': 'b', '步': 'b',
  '蔡': 'c', '曹': 'c', '岑': 'c', '柴': 'c', '常': 'c', '陈': 'c', '成': 'c', '程': 'c', '迟': 'c', '储': 'c', '崔': 'c',
  '戴': 'd', '邓': 'd', '狄': 'd', '丁': 'd', '董': 'd', '杜': 'd', '段': 'd',
  '鄂': 'e',
  '樊': 'f', '范': 'f', '方': 'f', '房': 'f', '费': 'f', '冯': 'f', '凤': 'f', '符': 'f', '傅': 'f',
  '高': 'g', '戈': 'g', '葛': 'g', '龚': 'g', '宫': 'g', '巩': 'g', '古': 'g', '谷': 'g', '顾': 'g', '管': 'g', '郭': 'g',
  '哈': 'h', '海': 'h', '韩': 'h', '何': 'h', '贺': 'h', '洪': 'h', '侯': 'h', '胡': 'h', '华': 'h', '黄': 'h', '霍': 'h',
  '嵇': 'j', '吉': 'j', '计': 'j', '季': 'j', '贾': 'j', '江': 'j', '姜': 'j', '蒋': 'j', '金': 'j', '靳': 'j', '经': 'j', '景': 'j',
  '孔': 'k', '寇': 'k',
  '赖': 'l', '兰': 'l', '蓝': 'l', '郎': 'l', '劳': 'l', '雷': 'l', '黎': 'l', '李': 'l', '连': 'l', '廉': 'l', '练': 'l', '梁': 'l', '林': 'l', '凌': 'l', '刘': 'l', '柳': 'l', '龙': 'l', '楼': 'l', '卢': 'l', '鲁': 'l', '陆': 'l', '吕': 'l', '罗': 'l', '骆': 'l',
  '马': 'm', '麻': 'm', '麦': 'm', '毛': 'm', '梅': 'm', '孟': 'm', '莫': 'm', '牟': 'm', '苗': 'm', '闵': 'm',
  '倪': 'n', '宁': 'n', '牛': 'n',
  '欧': 'o',
  '潘': 'p', '庞': 'p', '裴': 'p', '彭': 'p', '皮': 'p', '蒲': 'p',
  '戚': 'q', '齐': 'q', '钱': 'q', '强': 'q', '乔': 'q', '秦': 'q', '邱': 'q', '屈': 'q',
  '任': 'r', '荣': 'r', '茹': 'r', '阮': 'r',
  '桑': 's', '沙': 's', '商': 's', '邵': 's', '沈': 's', '施': 's', '石': 's', '史': 's', '舒': 's', '宋': 's', '苏': 's', '孙': 's', '隋': 's',
  '谭': 't', '汤': 't', '唐': 't', '陶': 't', '田': 't', '童': 't', '涂': 't',
  '万': 'w', '汪': 'w', '王': 'w', '韦': 'w', '魏': 'w', '温': 'w', '翁': 'w', '吴': 'w', '武': 'w',
  '席': 'x', '夏': 'x', '鲜': 'x', '向': 'x', '项': 'x', '萧': 'x', '谢': 'x', '辛': 'x', '徐': 'x', '许': 'x', '薛': 'x',
  '严': 'y', '颜': 'y', '杨': 'y', '姚': 'y', '叶': 'y', '殷': 'y', '于': 'y', '余': 'y', '俞': 'y', '虞': 'y', '元': 'y', '袁': 'y', '岳': 'y',
  '查': 'z', '翟': 'z', '詹': 'z', '张': 'z', '章': 'z', '赵': 'z', '郑': 'z', '钟': 'z', '周': 'z', '朱': 'z', '诸': 'z', '祝': 'z', '邹': 'z',
};

/** 中文名→拼音首字母(不盈→by);英文/数字原样小写;符号忽略。最多 6 字母。 */
export function toPinyinInitials(name: string): string {
  let result = '';
  for (const ch of String(name || '')) {
    if (/[a-zA-Z0-9]/.test(ch)) {
      result += ch.toLowerCase();
    } else if (PINYIN_INITIAL[ch]) {
      result += PINYIN_INITIAL[ch];
    }
  }
  return result.slice(0, 6) || 'agent';
}

/** 生成英文工作目录:/workspace/agents/<slug>-<6位随机>。每次调用都不同。 */
export function generateWorkingDir(name: string): string {
  const slug = toPinyinInitials(name);
  const random = Math.random().toString(36).slice(2, 8);
  return `/workspace/agents/${slug}-${random}`;
}

/**
 * R27 规则 2: bot 绑定一对一校验。
 * 检查某个 bot 是否已被其他 agent 绑定(在 channel_ids jsonb 数组里)。
 * 返回冲突 agent 的 name,无冲突返回 null。
 */
export async function findBotBindingConflict(
  botId: string,
  currentAgentId: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT a.name FROM agents a
     WHERE a.channel_ids @> $1::jsonb
       AND a.id::text != $2
       AND a.is_template = false`,
    [JSON.stringify([botId]), currentAgentId],
  );
  return result.rows.length > 0 ? (result.rows[0].name as string) : null;
}

/**
 * R27 规则 1: 实例间重名检查。模板可以同名,实例之间不重名。
 * 抛 Error(中文消息)如果实例重名。
 */
async function assertInstanceNameUnique(name: string, isTemplate: boolean, excludeId?: string): Promise<void> {
  if (isTemplate) return; // 模板允许重名
  const params: unknown[] = [name];
  let sql = `SELECT id FROM agents WHERE name = $1 AND is_template = false`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id::text != $2`;
  }
  const result = await pool.query(sql, params);
  if (result.rows.length > 0) {
    throw new Error(`实例名称"${name}"已存在,请用其他名称`);
  }
}


export interface AgentTemplate {
  id: string;
  tenantId: string;
  name: string;
  roleTemplate: string | null;
  description: string | null;
  capabilities: any[];
  tools: any[];
  systemPrompt: string | null;
  isActive: boolean;
  category: string;
  templateType: 'standard' | 'custom';
  sourceTemplateId: string | null;
  orchestration: any;
  boundary: any;
  ironLaws: string[];
  knowledgeFolders: string[];
  skills: string[];
  defaultEngine: string | null;
  defaultModel: string | null;
  defaultContextWindow: number;
  defaultMaxTurns: number | null;
  complexityLevel: string;
  status: 'active' | 'paused' | 'deprecated';
  persona: string | null;
  engine: string | null;
  displayName: string | null;
  ownerId: string | null;
  modelId: string | null;
  avatarUrl: string | null;
  avatarGlyph: string | null;
  avatarHue: string | null;
  deploymentType: string;
  // R15-A new fields
  isTemplate: boolean;
  workingDir: string | null;
  channelIds: string[];
  visibility: 'public' | 'private' | 'team';
  temperature: number;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentStore {
  async list(): Promise<AgentTemplate[]> {
    const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC');
    return result.rows.map((r: any) => this.mapRow(r));
  }

  /**
   * R15-A: 仅返回 agent 实例(is_template=false)。
   * 含 deprecated,管理员要能看见。
   */
  async listInstances(): Promise<AgentTemplate[]> {
    const result = await pool.query(
      'SELECT * FROM agents WHERE is_template = false ORDER BY created_at DESC',
    );
    return result.rows.map((r: any) => this.mapRow(r));
  }

  /**
   * R15-A: 仅返回模板(is_template=true)。
   * 模板可以处于任意 status(deprecated 模板仍可被复制)。
   */
  async listTemplates(): Promise<AgentTemplate[]> {
    const result = await pool.query(
      'SELECT * FROM agents WHERE is_template = true ORDER BY created_at DESC',
    );
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async listSummary(): Promise<AgentTemplate[]> {
    const result = await pool.query(
      'SELECT id, tenant_id, name, role_template, description, capabilities, tools, is_active, category, template_type, source_template_id, knowledge_folders, skills, default_engine, default_model, default_context_window, default_max_turns, complexity_level, status, persona, owner_user_id, model_id, is_template, working_dir, channel_ids, visibility, temperature, created_at, updated_at FROM agents ORDER BY created_at DESC',
    );
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async findById(id: string): Promise<AgentTemplate | null> {
    const result = await pool.query('SELECT * FROM agents WHERE id = $1', [id]);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async create(data: {
    name: string;
    roleTemplate?: string;
    description?: string;
    systemPrompt?: string;
    capabilities?: any[];
    tools?: any[];
    category?: string;
    templateType?: 'standard' | 'custom';
    sourceTemplateId?: string;
    knowledgeFolders?: string[];
    skills?: string[];
    ironLaws?: string[];
    boundary?: any;
    orchestration?: any;
    isTemplate?: boolean;
    workingDir?: string;
    channelIds?: string[];
    visibility?: 'public' | 'private' | 'team';
    temperature?: number;
    ownerId?: string;
    // R15-B wizard extras
    persona?: string;
    defaultEngine?: string;
    defaultModel?: string;
    defaultContextWindow?: number;
    avatarGlyph?: string;
    avatarHue?: string;
    modelId?: string;
  }): Promise<AgentTemplate> {
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    // R27 规则 1: 实例间重名检查(模板允许重名)
    await assertInstanceNameUnique(data.name, data.isTemplate ?? false);
    // R27 规则 1: 自动生成英文工作目录(如果调用方没传)
    const workingDir = data.workingDir || generateWorkingDir(data.name);

    const result = await pool.query(
      `INSERT INTO agents (
          tenant_id, name, role_template, description, system_prompt,
          capabilities, tools, category, template_type, source_template_id,
          knowledge_folders, skills, orchestration, boundary, iron_laws,
          is_template, working_dir, channel_ids, visibility, temperature, owner_user_id,
          persona, default_engine, default_model, default_context_window,
          avatar_glyph, avatar_hue, model_id
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
               $22, $23, $24, $25, $26, $27, $28)
       RETURNING *`,
      [
        tenantId,
        data.name,
        data.roleTemplate || null,
        data.description || null,
        data.systemPrompt || null,
        JSON.stringify(data.capabilities || []),
        JSON.stringify(data.tools || []),
        data.category || 'general',
        data.templateType || 'custom',
        data.sourceTemplateId || null,
        JSON.stringify(data.knowledgeFolders || []),
        JSON.stringify(data.skills || []),
        JSON.stringify(data.orchestration || {}),
        JSON.stringify(data.boundary || {}),
        JSON.stringify(data.ironLaws || []),
        data.isTemplate ?? false,
        workingDir,
        JSON.stringify(data.channelIds || []),
        data.visibility || 'team',
        data.temperature ?? 0.7,
        data.ownerId || null,
        data.persona ?? null,
        data.defaultEngine ?? null,
        data.defaultModel ?? null,
        data.defaultContextWindow ?? null,
        data.avatarGlyph ?? null,
        data.avatarHue ?? null,
        data.modelId ?? null,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /**
   * R15-A: 从模板复制创建独立 agent 实例。
   * 深拷贝 persona/system_prompt/skills/iron_laws 等所有配置字段,
   * 但分配新 id + 新 owner + is_template=false + source_template_id 指向模板。
   */
  async createInstanceFromTemplate(
    templateId: string,
    overrides: { name: string; ownerId?: string | null },
  ): Promise<AgentTemplate> {
    const tplResult = await pool.query('SELECT * FROM agents WHERE id = $1', [templateId]);
    if (tplResult.rows.length === 0) return null as unknown as AgentTemplate;
    const tpl = tplResult.rows[0];

    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    // R27 规则 1 + 规则 5: 复制 = 独立实例,实例间重名检查 + 新工作目录(不复用模板的)
    await assertInstanceNameUnique(overrides.name, false);

    const result = await pool.query(
      `INSERT INTO agents (
          tenant_id, name, role_template, description, system_prompt,
          capabilities, tools, category, template_type, source_template_id,
          knowledge_folders, skills, orchestration, boundary, iron_laws,
          default_engine, default_model, default_context_window, default_max_turns,
          complexity_level, persona, engine, deployment_type,
          is_template, working_dir, channel_ids, visibility, temperature, owner_user_id
        )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
               $16, $17, $18, $19, $20, $21, $22, $23,
               false, $24, $25, $26, $27, $28)
       RETURNING *`,
      [
        tenantId,
        overrides.name,
        tpl.role_template,
        tpl.description,
        tpl.system_prompt,
        JSON.stringify(tpl.capabilities ?? []),
        JSON.stringify(tpl.tools ?? []),
        tpl.category ?? 'general',
        'custom',
        templateId,
        JSON.stringify(tpl.knowledge_folders ?? []),
        JSON.stringify(tpl.skills ?? []),
        JSON.stringify(tpl.orchestration ?? {}),
        JSON.stringify(tpl.boundary ?? {}),
        JSON.stringify(tpl.iron_laws ?? []),
        tpl.default_engine ?? 'claude',
        tpl.default_model,
        tpl.default_context_window ?? 200000,
        tpl.default_max_turns,
        tpl.complexity_level ?? 'L1',
        tpl.persona,
        tpl.engine ?? 'anthropic-opus-4-7',
        tpl.deployment_type ?? 'bot',
        // working_dir 默认 /workspace/agents/<new_id> — 用 RETURNING 后再 UPDATE
        null,
        JSON.stringify([]),
        'team',
        tpl.temperature ?? 0.7,
        overrides.ownerId ?? null,
      ],
    );
    const created = result.rows[0];

    // 补 working_dir — R27 规则 5: 用拼音首字母生成新目录(不复用模板的)
    await pool.query(
      `UPDATE agents SET working_dir = $1 WHERE id = $2`,
      [generateWorkingDir(overrides.name), created.id],
    );
    const refreshed = await pool.query('SELECT * FROM agents WHERE id = $1', [created.id]);
    return this.mapRow(refreshed.rows[0]);
  }

  async update(
    id: string,
    data: {
      name?: string;
      roleTemplate?: string;
      description?: string;
      systemPrompt?: string;
      capabilities?: any[];
      tools?: any[];
      isActive?: boolean;
      category?: string;
      templateType?: 'standard' | 'custom';
      knowledgeFolders?: string[];
      skills?: string[];
      ironLaws?: string[];
      boundary?: any;
      orchestration?: any;
      persona?: string;
      defaultEngine?: string;
      defaultModel?: string;
      defaultContextWindow?: number;
      defaultMaxTurns?: number;
      complexityLevel?: string;
      engine?: string;
      status?: 'active' | 'paused' | 'deprecated';
      ownerId?: string;
      // R15-A new
      isTemplate?: boolean;
      workingDir?: string;
      channelIds?: string[];
      visibility?: 'public' | 'private' | 'team';
      temperature?: number;
      avatarGlyph?: string;
      avatarHue?: string;
      modelId?: string;
    },
  ): Promise<AgentTemplate | null> {
    // R27 规则 1: 改名时实例间重名检查(排除自己)
    if (data.name !== undefined) {
      const isTemplate = data.isTemplate ?? (await this.findById(id))?.isTemplate ?? false;
      await assertInstanceNameUnique(data.name, isTemplate, id);
    }
    // R27 规则 2: bot 绑定一对一 — 新增绑定前检查每个 bot 是否已被其他 agent 占用
    if (data.channelIds !== undefined && Array.isArray(data.channelIds)) {
      for (const botId of data.channelIds) {
        if (typeof botId !== 'string' || botId.length === 0) continue;
        const conflict = await findBotBindingConflict(botId, id);
        if (conflict) {
          const err = new Error(`该入口已绑定 ${conflict},请先在该 agent 解绑`) as Error & { code?: string; boundAgent?: string };
          err.code = 'bot_already_bound';
          err.boundAgent = conflict;
          throw err;
        }
      }
    }
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) { sets.push(`name = $${idx++}`); values.push(data.name); }
    if (data.roleTemplate !== undefined) { sets.push(`role_template = $${idx++}`); values.push(data.roleTemplate); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); values.push(data.description); }
    if (data.systemPrompt !== undefined) { sets.push(`system_prompt = $${idx++}`); values.push(data.systemPrompt); }
    if (data.capabilities !== undefined) { sets.push(`capabilities = $${idx++}`); values.push(JSON.stringify(data.capabilities)); }
    if (data.tools !== undefined) { sets.push(`tools = $${idx++}`); values.push(JSON.stringify(data.tools)); }
    if (data.isActive !== undefined) { sets.push(`is_active = $${idx++}`); values.push(data.isActive); }
    if (data.category !== undefined) { sets.push(`category = $${idx++}`); values.push(data.category); }
    if (data.templateType !== undefined) { sets.push(`template_type = $${idx++}`); values.push(data.templateType); }
    if (data.knowledgeFolders !== undefined) { sets.push(`knowledge_folders = $${idx++}`); values.push(JSON.stringify(data.knowledgeFolders)); }
    if (data.skills !== undefined) { sets.push(`skills = $${idx++}`); values.push(JSON.stringify(data.skills)); }
    if (data.ironLaws !== undefined) { sets.push(`iron_laws = $${idx++}`); values.push(JSON.stringify(data.ironLaws)); }
    if (data.boundary !== undefined) { sets.push(`boundary = $${idx++}`); values.push(JSON.stringify(data.boundary)); }
    if (data.orchestration !== undefined) { sets.push(`orchestration = $${idx++}`); values.push(JSON.stringify(data.orchestration)); }
    if (data.persona !== undefined) { sets.push(`persona = $${idx++}`); values.push(data.persona); }
    if (data.defaultEngine !== undefined) { sets.push(`default_engine = $${idx++}`); values.push(data.defaultEngine); }
    if (data.defaultModel !== undefined) { sets.push(`default_model = $${idx++}`); values.push(data.defaultModel); }
    if (data.defaultContextWindow !== undefined) { sets.push(`default_context_window = $${idx++}`); values.push(data.defaultContextWindow); }
    if (data.defaultMaxTurns !== undefined) { sets.push(`default_max_turns = $${idx++}`); values.push(data.defaultMaxTurns); }
    if (data.complexityLevel !== undefined) { sets.push(`complexity_level = $${idx++}`); values.push(data.complexityLevel); }
    if (data.engine !== undefined) { sets.push(`engine = $${idx++}`); values.push(data.engine); }
    if (data.status !== undefined) { sets.push(`status = $${idx++}`); values.push(data.status); }
    if (data.ownerId !== undefined) { sets.push(`owner_user_id = $${idx++}`); values.push(data.ownerId); }
    if (data.isTemplate !== undefined) { sets.push(`is_template = $${idx++}`); values.push(data.isTemplate); }
    if (data.workingDir !== undefined) { sets.push(`working_dir = $${idx++}`); values.push(data.workingDir); }
    if (data.channelIds !== undefined) { sets.push(`channel_ids = $${idx++}`); values.push(JSON.stringify(data.channelIds)); }
    if (data.visibility !== undefined) { sets.push(`visibility = $${idx++}`); values.push(data.visibility); }
    if (data.temperature !== undefined) { sets.push(`temperature = $${idx++}`); values.push(data.temperature); }
    if (data.avatarGlyph !== undefined) { sets.push(`avatar_glyph = $${idx++}`); values.push(data.avatarGlyph); }
    if (data.avatarHue !== undefined) { sets.push(`avatar_hue = $${idx++}`); values.push(data.avatarHue); }
    if (data.modelId !== undefined) { sets.push(`model_id = $${idx++}`); values.push(data.modelId); }
    if (data.defaultContextWindow !== undefined) { sets.push(`default_context_window = $${idx++}`); values.push(data.defaultContextWindow); }
    if (data.persona !== undefined) { sets.push(`persona = $${idx++}`); values.push(data.persona); }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = now()`);
    values.push(id);

    const result = await pool.query(`UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  private mapRow(row: any): AgentTemplate {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      roleTemplate: row.role_template,
      description: row.description,
      capabilities: typeof row.capabilities === 'string' ? JSON.parse(row.capabilities) : row.capabilities || [],
      tools: typeof row.tools === 'string' ? JSON.parse(row.tools) : row.tools || [],
      systemPrompt: row.system_prompt,
      isActive: row.is_active,
      category: row.category || 'general',
      templateType: row.template_type || 'custom',
      sourceTemplateId: row.source_template_id,
      knowledgeFolders:
        typeof row.knowledge_folders === 'string' ? JSON.parse(row.knowledge_folders) : row.knowledge_folders || [],
      skills: typeof row.skills === 'string' ? JSON.parse(row.skills) : row.skills || [],
      orchestration: typeof row.orchestration === 'string' ? JSON.parse(row.orchestration) : row.orchestration || {},
      boundary: typeof row.boundary === 'string' ? JSON.parse(row.boundary) : row.boundary || {},
      ironLaws: typeof row.iron_laws === 'string' ? JSON.parse(row.iron_laws) : row.iron_laws || [],
      defaultEngine: row.default_engine || null,
      defaultModel: row.default_model || null,
      defaultContextWindow: row.default_context_window || 200000,
      defaultMaxTurns: row.default_max_turns || null,
      complexityLevel: row.complexity_level || 'L1',
      status: row.status || 'active',
      persona: row.persona || null,
      engine: row.engine || null,
      displayName: row.display_name || null,
      ownerId: row.owner_user_id || null,
      modelId: row.model_id || null,
      avatarUrl: row.avatar_url || null,
      avatarGlyph: row.avatar_glyph || null,
      avatarHue: row.avatar_hue || null,
      deploymentType: row.deployment_type || 'bot',
      isTemplate: row.is_template ?? false,
      workingDir: row.working_dir || null,
      channelIds:
        typeof row.channel_ids === 'string' ? JSON.parse(row.channel_ids) : row.channel_ids || [],
      visibility: row.visibility || 'team',
      temperature: row.temperature ?? 0.7,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
