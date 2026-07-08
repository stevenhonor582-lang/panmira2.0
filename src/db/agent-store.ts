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
  createdAt: Date;
  updatedAt: Date;
}

export class AgentStore {
  async list(): Promise<AgentTemplate[]> {
    const result = await pool.query('SELECT * FROM agents ORDER BY created_at DESC');
    return result.rows.map((r: any) => this.mapRow(r));
  }

  async listSummary(): Promise<AgentTemplate[]> {
    const result = await pool.query(
      'SELECT id, tenant_id, name, role_template, description, capabilities, tools, is_active, category, template_type, source_template_id, knowledge_folders, skills, default_engine, default_model, default_context_window, default_max_turns, complexity_level, created_at, updated_at FROM agents ORDER BY created_at DESC',
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
  }): Promise<AgentTemplate> {
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    if (tenantResult.rows.length === 0) throw new Error('No tenant found');
    const tenantId = tenantResult.rows[0].id;

    const result = await pool.query(
      `INSERT INTO agents (tenant_id, name, role_template, description, system_prompt, capabilities, tools, category, template_type, source_template_id, knowledge_folders, skills, orchestration, boundary, iron_laws)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
      ],
    );
    return this.mapRow(result.rows[0]);
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
    },
  ): Promise<AgentTemplate | null> {
    const sets: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) {
      sets.push(`name = $${idx++}`);
      values.push(data.name);
    }
    if (data.roleTemplate !== undefined) {
      sets.push(`role_template = $${idx++}`);
      values.push(data.roleTemplate);
    }
    if (data.description !== undefined) {
      sets.push(`description = $${idx++}`);
      values.push(data.description);
    }
    if (data.systemPrompt !== undefined) {
      sets.push(`system_prompt = $${idx++}`);
      values.push(data.systemPrompt);
    }
    if (data.capabilities !== undefined) {
      sets.push(`capabilities = $${idx++}`);
      values.push(JSON.stringify(data.capabilities));
    }
    if (data.tools !== undefined) {
      sets.push(`tools = $${idx++}`);
      values.push(JSON.stringify(data.tools));
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${idx++}`);
      values.push(data.isActive);
    }
    if (data.category !== undefined) {
      sets.push(`category = $${idx++}`);
      values.push(data.category);
    }
    if (data.templateType !== undefined) {
      sets.push(`template_type = $${idx++}`);
      values.push(data.templateType);
    }
    if (data.knowledgeFolders !== undefined) {
      sets.push(`knowledge_folders = $${idx++}`);
      values.push(JSON.stringify(data.knowledgeFolders));
    }
    if (data.skills !== undefined) {
      sets.push(`skills = $${idx++}`);
      values.push(JSON.stringify(data.skills));
    }
    if (data.ironLaws !== undefined) {
      sets.push(`iron_laws = $${idx++}`);
      values.push(JSON.stringify(data.ironLaws));
    }
    if (data.boundary !== undefined) {
      sets.push(`boundary = $${idx++}`);
      values.push(JSON.stringify(data.boundary));
    }
    if (data.orchestration !== undefined) {
      sets.push(`orchestration = $${idx++}`);
      values.push(JSON.stringify(data.orchestration));
    }
    if (data.persona !== undefined) {
      sets.push(`persona = $${idx++}`);
      values.push(data.persona);
    }
    if (data.defaultEngine !== undefined) {
      sets.push(`default_engine = $${idx++}`);
      values.push(data.defaultEngine);
    }
    if (data.defaultModel !== undefined) {
      sets.push(`default_model = $${idx++}`);
      values.push(data.defaultModel);
    }
    if (data.defaultContextWindow !== undefined) {
      sets.push(`default_context_window = $${idx++}`);
      values.push(data.defaultContextWindow);
    }
    if (data.defaultMaxTurns !== undefined) {
      sets.push(`default_max_turns = $${idx++}`);
      values.push(data.defaultMaxTurns);
    }
    if (data.complexityLevel !== undefined) {
      sets.push(`complexity_level = $${idx++}`);
      values.push(data.complexityLevel);
    }
    if (data.engine !== undefined) {
      sets.push(`engine = $${idx++}`);
      values.push(data.engine);
    }
    if (data.status !== undefined) {
      sets.push(`status = $${idx++}`);
      values.push(data.status);
    }
    if (data.ownerId !== undefined) {
      sets.push(`owner_user_id = $${idx++}`);
      values.push(data.ownerId);
    }

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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
