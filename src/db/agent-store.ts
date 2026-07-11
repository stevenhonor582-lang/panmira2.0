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
 * 检查某个 bot 是否已被其他 instance 绑定(在 channel_ids jsonb 数组里)。
 * 返回冲突 instance 的 name,无冲突返回 null。
 *
 * R42-SCHEMA: agent_templates 没有 channel_ids(模板不绑 bot),
 * 所以只查 agent_instances 即可。
 */
export async function findBotBindingConflict(
  botId: string,
  currentAgentId: string,
): Promise<string | null> {
  const result = await pool.query(
    `SELECT a.name FROM agent_instances a
     WHERE a.channel_ids @> $1::jsonb
       AND a.id::text != $2`,
    [JSON.stringify([botId]), currentAgentId],
  );
  return result.rows.length > 0 ? (result.rows[0].name as string) : null;
}

/**
 * R27 规则 1 (R42 适配): 实例间重名检查。
 * 模板允许重名;实例之间不重名 — 只查 agent_instances 表。
 * 抛 Error(中文消息)如果实例重名。
 */
async function assertInstanceNameUnique(name: string, excludeId?: string): Promise<void> {
  const params: unknown[] = [name];
  let sql = `SELECT id FROM agent_instances WHERE name = $1`;
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id::text != $2`;
  }
  const result = await pool.query(sql, params);
  if (result.rows.length > 0) {
    throw new Error(`实例名称"${name}"已存在,请用其他名称`);
  }
}


export interface AgentRecord {
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
  defaultEngine: string | null;
  defaultModel: string | null;
  defaultContextWindow: number;
  defaultMaxTurns: number | null;
  complexityLevel: string;
  status: 'active' | 'paused' | 'deprecated';
  persona: string | null;
  displayName: string | null;
  ownerUserId: string | null;
  modelId: string | null;
  avatarUrl: string | null;
  avatarGlyph: string | null;
  avatarHue: string | null;
  deploymentType: string;
  workingDir: string | null;
  channelIds: string[];
  visibility: 'public' | 'private' | 'team';
  temperature: number;
  createdAt: Date;
  updatedAt: Date;
  /** 'template' or 'instance' — R42-SCHEMA 区分表 */
  targetType: 'template' | 'instance';
}

/**
 * instance 独有字段别名(对外保持稳定):
 *  - ownerId → ownerUserId
 *  - knowledgeFolders / skills → instance 不再用旧字段(由 *_refs 多态表承担)
 *  - engine / displayName / persona 等保持原意
 */
export interface AgentInstance extends AgentRecord {
  targetType: 'instance';
}

export interface AgentTemplate extends AgentRecord {
  targetType: 'template';
}

export class AgentStore {
  // ===========================================================================
  // READ
  // ===========================================================================

  /** R42: 列出全部 instance(供前端默认列表用) */
  async listInstances(): Promise<AgentInstance[]> {
    const result = await pool.query(
      'SELECT * FROM agent_instances ORDER BY created_at DESC',
    );
    return result.rows.map((r: any) => this.mapRow(r, 'instance'));
  }

  /** R42: 列出全部 template(供模板库使用) */
  async listTemplates(): Promise<AgentTemplate[]> {
    // R42: agent_templates 表无 status 字段(蓝图无状态机);按 created_at DESC 排
    const result = await pool.query(
      `SELECT * FROM agent_templates ORDER BY created_at DESC`,
    );
    return result.rows.map((r: any) => this.mapRow(r, 'template'));
  }

  /**
   * Backward compat: 列出全部(union template + instance)。
   * 真实业务已不需要,但 http-server.ts 的 /api/agents list 还在用。
   */
  async list(): Promise<AgentRecord[]> {
    const result = await pool.query(`
      SELECT *, 'template'::text AS target_type FROM agent_templates
      UNION ALL
      SELECT *, 'instance'::text AS target_type FROM agent_instances
      ORDER BY created_at DESC
    `);
    return result.rows.map((r: any) => this.mapRow(r, r.target_type));
  }

  /** listSummary: 与 list 同形,只取常用字段,不做 union(用于 /api/agents GET 列表) */
  async listSummary(): Promise<AgentRecord[]> {
    const result = await pool.query(`
      SELECT
        id, tenant_id, name, role_template, description, capabilities, tools,
        is_active, category, template_type, source_template_id,
        default_engine, default_model, default_context_window, default_max_turns,
        complexity_level, status, persona, owner_user_id, model_id,
        working_dir, channel_ids, visibility, temperature,
        created_at, updated_at,
        'template'::text AS target_type
      FROM agent_templates
      UNION ALL
      SELECT
        id, tenant_id, name, role_template, description, capabilities, tools,
        is_active, category, template_type, source_template_id,
        default_engine, default_model, default_context_window, default_max_turns,
        complexity_level, status, persona, owner_user_id, model_id,
        working_dir, channel_ids, visibility, temperature,
        created_at, updated_at,
        'instance'::text AS target_type
      FROM agent_instances
      ORDER BY created_at DESC
    `);
    return result.rows.map((r: any) => this.mapRow(r, r.target_type));
  }

  /**
   * R42: 通用 find — 先查 instance,再查 template。
   * 旧 /api/v2/employees/:id 没有 /template 或 /instance 后缀,保留向后兼容。
   * 返回的 record 包含 targetType 字段,调用方据此 dispatch。
   */
  async findById(id: string): Promise<AgentRecord | null> {
    const inst = await this.findInstanceById(id);
    if (inst) return inst;
    return await this.findTemplateById(id);
  }

  async findInstanceById(id: string): Promise<AgentInstance | null> {
    const result = await pool.query('SELECT * FROM agent_instances WHERE id = $1', [id]);
    return result.rows.length > 0 ? (this.mapRow(result.rows[0], 'instance') as AgentInstance) : null;
  }

  async findTemplateById(id: string): Promise<AgentTemplate | null> {
    const result = await pool.query('SELECT * FROM agent_templates WHERE id = $1', [id]);
    return result.rows.length > 0 ? (this.mapRow(result.rows[0], 'template') as AgentTemplate) : null;
  }

  // ===========================================================================
  // CREATE — instance
  // ===========================================================================

  async createInstance(data: {
    name: string;
    roleTemplate?: string;
    description?: string;
    systemPrompt?: string;
    capabilities?: any[];
    tools?: any[];
    category?: string;
    templateType?: 'standard' | 'custom';
    sourceTemplateId?: string;
    ironLaws?: string[];
    boundary?: any;
    orchestration?: any;
    workingDir?: string;
    channelIds?: string[];
    visibility?: 'public' | 'private' | 'team';
    temperature?: number;
    ownerUserId?: string;
    persona?: string;
    defaultEngine?: string;
    defaultModel?: string;
    defaultContextWindow?: number;
    avatarGlyph?: string;
    avatarHue?: string;
    modelId?: string;
    deploymentType?: string;
    status?: 'active' | 'paused' | 'deprecated';
    displayName?: string;
    avatarUrl?: string;
  }): Promise<AgentInstance> {
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    await assertInstanceNameUnique(data.name);
    // R66-D: 工作目录系统锁定 — 永远自动生成安全 slug(拼音首字母+随机),忽略前端传入,不接受中文/全角/空格/特殊字符
    const workingDir = generateWorkingDir(data.name);

    const result = await pool.query(
      `INSERT INTO agent_instances (
          id, tenant_id, name, role_template, description, system_prompt,
          capabilities, tools, category, template_type, source_template_id,
          orchestration, boundary, iron_laws,
          working_dir, channel_ids, visibility, temperature, owner_user_id,
          persona, default_engine, default_model, default_context_window,
          avatar_glyph, avatar_hue, model_id, deployment_type, status,
          display_name, avatar_url
        )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, $13, $14, $15, $16, $17, $18,
               $19, $20, $21, $22, $23, $24, $25, $26, $27,
               $28, $29)
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
        JSON.stringify(data.orchestration || {}),
        JSON.stringify(data.boundary || {}),
        JSON.stringify(data.ironLaws || []),
        workingDir,
        JSON.stringify(data.channelIds || []),
        data.visibility || 'team',
        data.temperature ?? 0.7,
        data.ownerUserId || null,
        data.persona ?? null,
        data.defaultEngine ?? null,
        data.defaultModel ?? null,
        data.defaultContextWindow ?? null,
        data.avatarGlyph ?? null,
        data.avatarHue ?? null,
        data.modelId ?? null,
        data.deploymentType ?? 'bot',
        data.status ?? 'active',
        data.displayName ?? null,
        data.avatarUrl ?? null,
      ],
    );
    return this.mapRow(result.rows[0], 'instance') as AgentInstance;
  }

  /**
   * R42: createTemplate — 蓝图字段。
   * 模板允许重名(同业务下多个同名模板共享蓝图)。
   */
  async createTemplate(data: {
    name: string;
    roleTemplate?: string;
    description?: string;
    systemPrompt?: string;
    capabilities?: any[];
    tools?: any[];
    category?: string;
    templateType?: 'standard' | 'custom';
    ironLaws?: string[];
    boundary?: any;
    orchestration?: any;
    persona?: string;
    isActive?: boolean;
    createdBy?: string;
    /** R57: 部门 FK(uuid → departments.id),可空 */
    departmentId?: string | null;
  }): Promise<AgentTemplate> {
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO agent_templates (
          id, tenant_id, name, role_template, description, system_prompt,
          capabilities, tools, category, template_type,
          orchestration, boundary, iron_laws, persona, is_active, created_by,
          department_id
        )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9,
               $10, $11, $12, $13, $14, $15, $16)
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
        JSON.stringify(data.orchestration || {}),
        JSON.stringify(data.boundary || {}),
        JSON.stringify(data.ironLaws || []),
        data.persona ?? null,
        data.isActive ?? true,
        data.createdBy ?? null,
        data.departmentId || null,
      ],
    );
    return this.mapRow(result.rows[0], 'template') as AgentTemplate;
  }

  /**
   * R42: 从 template 复制创建 instance(替代 promote/demote/copy-as-template)。
   * 读 agent_templates.蓝图 → INSERT INTO agent_instances + 新 owner + 新 working_dir。
   * 同步克隆 refs 关联(skill/kb/mcp 多态表;target_type='instance')。
   */
  async createInstanceFromTemplate(
    templateId: string,
    overrides: { name: string; ownerUserId?: string | null },
  ): Promise<AgentInstance | null> {
    const tplResult = await pool.query('SELECT * FROM agent_templates WHERE id = $1', [templateId]);
    if (tplResult.rows.length === 0) return null;
    const tpl = tplResult.rows[0];

    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    await assertInstanceNameUnique(overrides.name);

    const result = await pool.query(
      `INSERT INTO agent_instances (
          id, tenant_id, name, role_template, description, system_prompt,
          capabilities, tools, category, template_type, source_template_id,
          orchestration, boundary, iron_laws,
          default_engine, default_model, default_context_window, default_max_turns,
          complexity_level, persona, deployment_type,
          working_dir, channel_ids, visibility, temperature, owner_user_id
        )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, 'custom', $9,
               $10, $11, $12,
               $13, $14, $15, $16,
               $17, $18, 'bot',
               $19, '[]'::jsonb, 'team', $20, $21)
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
        templateId,
        JSON.stringify(tpl.orchestration ?? {}),
        JSON.stringify(tpl.boundary ?? {}),
        JSON.stringify(tpl.iron_laws ?? []),
        tpl.default_engine ?? 'claude',
        tpl.default_model,
        200000,
        tpl.default_max_turns,
        tpl.complexity_level ?? 'L1',
        tpl.persona,
        null, // working_dir — RETURNING 后再 UPDATE
        tpl.temperature ?? 0.7,
        overrides.ownerUserId ?? null,
      ],
    );
    const created = result.rows[0];

    // R27 规则 5: 用拼音首字母生成新目录(不复用模板的)
    await pool.query(
      `UPDATE agent_instances SET working_dir = $1 WHERE id = $2`,
      [generateWorkingDir(overrides.name), created.id],
    );
    const refreshed = await pool.query('SELECT * FROM agent_instances WHERE id = $1', [created.id]);
    const instance = this.mapRow(refreshed.rows[0], 'instance') as AgentInstance;

    // R38-C4 阶段 3.5 (R42 适配): 克隆 refs 时必须显式带 target_type='instance' + 重新指向新 id
    // 模板的 refs 是 target_type='template',克隆后必须改成 'instance'
    await pool.query(
      `INSERT INTO agent_skill_refs (agent_id, target_type, skill_id, skill_version, params)
        SELECT $1, 'instance'::target_type, skill_id, skill_version, params
          FROM agent_skill_refs
         WHERE agent_id = $2 AND target_type = 'template'`,
      [instance.id, templateId],
    );
    await pool.query(
      `INSERT INTO agent_knowledge_refs (agent_id, target_type, kb_id, top_k, min_score)
        SELECT $1, 'instance'::target_type, kb_id, top_k, min_score
          FROM agent_knowledge_refs
         WHERE agent_id = $2 AND target_type = 'template'`,
      [instance.id, templateId],
    );
    await pool.query(
      `INSERT INTO agent_mcp_refs (agent_id, target_type, mcp_server_id, params)
        SELECT $1, 'instance'::target_type, mcp_server_id, params
          FROM agent_mcp_refs
         WHERE agent_id = $2 AND target_type = 'template'`,
      [instance.id, templateId],
    );

    return instance;
  }

  // ===========================================================================
  // UPDATE — 自动 dispatch
  // ===========================================================================

  /**
   * R42: 通用 update — 先 findById 决定 template / instance,再分表更新。
   * 旧 /api/v2/employees/:id PATCH 走这里。
   */
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
      ironLaws?: string[];
      boundary?: any;
      orchestration?: any;
      persona?: string;
      defaultEngine?: string;
      defaultModel?: string;
      defaultContextWindow?: number;
      defaultMaxTurns?: number;
      complexityLevel?: string;
      status?: 'active' | 'paused' | 'deprecated';
      ownerUserId?: string;
      workingDir?: string;
      channelIds?: string[];
      visibility?: 'public' | 'private' | 'team';
      temperature?: number;
      avatarGlyph?: string;
      avatarHue?: string;
      modelId?: string;
      displayName?: string;
      avatarUrl?: string;
      deploymentType?: string;
    },
  ): Promise<AgentRecord | null> {
    // 决定哪张表
    const isInstance = (await this.findInstanceById(id)) !== null;
    const isTemplate = !isInstance && (await this.findTemplateById(id)) !== null;
    if (!isInstance && !isTemplate) return null;

    // R27 规则 1: 改名时实例间重名检查(模板允许重名)
    if (data.name !== undefined && isInstance) {
      await assertInstanceNameUnique(data.name, id);
    }

    // R27 规则 2: bot 绑定一对一 — channelIds 仅 instance 校验
    if (isInstance && data.channelIds !== undefined && Array.isArray(data.channelIds)) {
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

    const set = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`);
      values.push(val);
    };

    // 蓝图字段(两表都有)
    if (data.name !== undefined) set('name', data.name);
    if (data.roleTemplate !== undefined) set('role_template', data.roleTemplate);
    if (data.description !== undefined) set('description', data.description);
    if (data.systemPrompt !== undefined) set('system_prompt', data.systemPrompt);
    if (data.capabilities !== undefined) set('capabilities', JSON.stringify(data.capabilities));
    if (data.tools !== undefined) set('tools', JSON.stringify(data.tools));
    if (data.isActive !== undefined) set('is_active', data.isActive);
    if (data.category !== undefined) set('category', data.category);
    if (data.templateType !== undefined) set('template_type', data.templateType);
    if (data.ironLaws !== undefined) set('iron_laws', JSON.stringify(data.ironLaws));
    if (data.boundary !== undefined) set('boundary', JSON.stringify(data.boundary));
    if (data.orchestration !== undefined) set('orchestration', JSON.stringify(data.orchestration));
    if (data.persona !== undefined) set('persona', data.persona);
    if (data.defaultEngine !== undefined) set('default_engine', data.defaultEngine);
    if (data.defaultModel !== undefined) set('default_model', data.defaultModel);
    if (data.defaultContextWindow !== undefined) set('default_context_window', data.defaultContextWindow);
    if (data.defaultMaxTurns !== undefined) set('default_max_turns', data.defaultMaxTurns);
    if (data.complexityLevel !== undefined) set('complexity_level', data.complexityLevel);
    if (data.status !== undefined) set('status', data.status);
    if (data.temperature !== undefined) set('temperature', data.temperature);

    // instance 独有字段
    if (isInstance) {
      if (data.ownerUserId !== undefined) set('owner_user_id', data.ownerUserId);
      // R66-D: 工作目录系统锁定 — 创建后不可手动修改(忽略 data.workingDir)
      if (data.channelIds !== undefined) set('channel_ids', JSON.stringify(data.channelIds));
      if (data.visibility !== undefined) set('visibility', data.visibility);
      if (data.avatarGlyph !== undefined) set('avatar_glyph', data.avatarGlyph);
      if (data.avatarHue !== undefined) set('avatar_hue', data.avatarHue);
      if (data.modelId !== undefined) set('model_id', data.modelId);
      if (data.displayName !== undefined) set('display_name', data.displayName);
      if (data.avatarUrl !== undefined) set('avatar_url', data.avatarUrl);
      if (data.deploymentType !== undefined) set('deployment_type', data.deploymentType);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = now()`);
    values.push(id);

    const table = isInstance ? 'agent_instances' : 'agent_templates';
    const sql = `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`;
    const result = await pool.query(sql, values);
    return result.rows.length > 0 ? (this.mapRow(result.rows[0], isInstance ? 'instance' : 'template') as AgentRecord) : null;
  }

  // ===========================================================================
  // DELETE
  // ===========================================================================

  async delete(id: string): Promise<boolean> {
    // 先尝试 instance,再 template
    const inst = await pool.query('DELETE FROM agent_instances WHERE id = $1', [id]);
    if ((inst.rowCount ?? 0) > 0) return true;
    const tpl = await pool.query('DELETE FROM agent_templates WHERE id = $1', [id]);
    return (tpl.rowCount ?? 0) > 0;
  }

  // ===========================================================================
  // MAPPER
  // ===========================================================================

  private mapRow(row: any, targetType: 'template' | 'instance'): AgentRecord {
    const rec: AgentRecord = {
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
      displayName: row.display_name || null,
      ownerUserId: row.owner_user_id || null,
      modelId: row.model_id || null,
      avatarUrl: row.avatar_url || null,
      avatarGlyph: row.avatar_glyph || null,
      avatarHue: row.avatar_hue || null,
      deploymentType: row.deployment_type || 'bot',
      workingDir: row.working_dir || null,
      channelIds:
        typeof row.channel_ids === 'string' ? JSON.parse(row.channel_ids) : row.channel_ids || [],
      visibility: row.visibility || 'team',
      temperature: row.temperature ?? 0.7,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      targetType,
    };
    return rec;
  }
}