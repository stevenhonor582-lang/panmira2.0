import { pool } from './index.js';

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
        data.workingDir ?? null,
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

    // 补 working_dir(用生成的 id)
    await pool.query(
      `UPDATE agents SET working_dir = $1 WHERE id = $2`,
      [`/workspace/agents/${created.id}`, created.id],
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
