// Shared types + fetchers + design-layer constants for the Employees module.
// AGENTS / KB_FOLDERS / logSeries all back onto real API calls now;
// PERSONALITY_PRESETS / TEMPLATE_PRESETS / KB_FOLDERS are design-layer
// constants (not data — they don't live in the database by design).

import { api } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
function fullPath(p: string): string {
  if (!API_BASE) return p;
  if (p.startsWith("http")) return p;
  return API_BASE + p;
}

export type AgentStatus = "active" | "deprecated" | "draft" | "paused";

export type AgentRole = string;

export interface Agent {
  id: string;
  name: string;
  displayName: string;
  persona: string;
  description: string;
  status: AgentStatus;
  role: AgentRole;
  model: string;
  contextWindow: number;
  temperature: number;
  ownerId: string | null;
  ownerName: string;
  templateSource: string | null;
  version: number;
  createdAt: string;
  hue: string;
  glyph: string;
  complexity: "L1" | "L2" | "L3" | "L4";
  tasksToday: number;
  trendPct: number;
  skills: string[];
  mcpServers: string[];
  tools: string[];
  ironLaws: string[];
  memoryLayers: { short: number; long: number; permanent: number };
  collaborators: { botId?: string; humanId?: string; relation: string }[];
  // 可编辑扩展字段(R13-B)
  systemPrompt: string;
  engine: string;
  complexityLevel: string;
  templateType: string;
  knowledgeFolders: string[];
  defaultEngine: string;
  defaultModel: string;
  defaultContextWindow: number;
  defaultMaxTurns: number | null;
  /** 原始 row,供编辑表单取精确字段名(snake_case) */
  raw: Record<string, unknown> | null;
  /** 最后一次更新时间(用于触发 draft 重新生成) */
  updatedAt: string;
  // R15-A: template vs instance + multi-bot working_dir + channel + visibility + temperature
  isTemplate: boolean;
  workingDir: string | null;
  channelIds: string[];
  visibility: "public" | "private" | "team";
  temperature: number;
}

export interface KBFolder {
  id: string;
  name: string;
  files: number;
  hue: string;
}

export interface LogEntry {
  ts: string;
  task: string;
  ok: boolean;
  ms: number;
}

// Hue/glyph synthesized per role for the gallery card.
const HUE_BY_ROLE: Record<string, { hue: string; glyph: string }> = {
  "full-stack-engineer": { hue: "amber", glyph: "工" },
  "copywriting-secretary": { hue: "rose", glyph: "文" },
  "ops-engineer": { hue: "teal", glyph: "运" },
  "test-bot": { hue: "lime", glyph: "测" },
  "customer-support": { hue: "sky", glyph: "客" },
  "research-analyst": { hue: "indigo", glyph: "研" },
  engineering: { hue: "zinc", glyph: "E" },
  general: { hue: "violet", glyph: "B" },
};

function pickInitial(name: string): string {
  const n = name || "";
  for (const ch of n) {
    if (/[一-龥]/.test(ch)) return ch;
  }
  const m = n.match(/[A-Za-z]/);
  return m ? m[0].toUpperCase() : "B";
}

function mapEmployeeToAgent(row: any): Agent {
  const role = row.role_template ?? row.roleTemplate ?? "general";
  const isActive = row.is_active ?? row.isActive ?? true;
  const rawStatus = row.status ?? "active";
  const status: AgentStatus =
    rawStatus === "paused" ? "paused" :
    rawStatus === "deprecated" ? "deprecated" :
    isActive ? "active" : "deprecated";
  const meta = HUE_BY_ROLE[role] ?? { hue: "stone", glyph: pickInitial(row.display_name ?? row.name ?? "") };
  return {
    id: row.id,
    name: row.name ?? "",
    displayName: row.display_name ?? row.displayName ?? row.name ?? "",
    persona: row.persona ?? row.description ?? "",
    description: row.description ?? "",
    status,
    role,
    model: row.default_model ?? row.defaultModel ?? "claude-sonnet-4.6",
    contextWindow: row.default_context_window ?? row.defaultContextWindow ?? 200000,
    temperature: 0.3,
    ownerId: row.owner_user_id ?? row.ownerId ?? null,
    ownerName: "系统模板",
    templateSource: row.source_template_id ?? null,
    version: row.version ?? 1,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    hue: row.avatar_hue ?? meta.hue,
    glyph: row.avatar_glyph ?? meta.glyph,
    complexity: row.complexity_level ?? row.complexityLevel ?? "L2",
    tasksToday: 0,
    trendPct: 0,
    skills: Array.isArray(row.capabilities) ? row.capabilities : [],
    mcpServers: [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    ironLaws: Array.isArray(row.iron_laws) ? row.iron_laws : (Array.isArray(row.ironLaws) ? row.ironLaws : []),
    memoryLayers: { short: 0, long: 0, permanent: 0 },
    collaborators: [],
    // 扩展字段
    systemPrompt: row.system_prompt ?? row.systemPrompt ?? "",
    engine: row.engine ?? "anthropic-opus-4-7",
    complexityLevel: row.complexity_level ?? row.complexityLevel ?? "L1",
    templateType: row.template_type ?? row.templateType ?? "custom",
    knowledgeFolders: Array.isArray(row.knowledge_folders) ? row.knowledge_folders : [],
    defaultEngine: row.default_engine ?? row.defaultEngine ?? "claude",
    defaultModel: row.default_model ?? row.defaultModel ?? "",
    defaultContextWindow: row.default_context_window ?? row.defaultContextWindow ?? 200000,
    defaultMaxTurns: row.default_max_turns ?? row.defaultMaxTurns ?? null,
    // R15-A
    isTemplate: Boolean(row.is_template ?? row.isTemplate ?? false),
    workingDir: row.working_dir ?? row.workingDir ?? null,
    channelIds: Array.isArray(row.channel_ids)
      ? row.channel_ids
      : Array.isArray(row.channelIds)
      ? row.channelIds
      : [],
    visibility: (row.visibility ?? "team") as Agent["visibility"],
    temperature: typeof row.temperature === "number" ? row.temperature : 0.7,
    raw: row,
    updatedAt: row.updated_at ?? row.updatedAt ?? row.created_at ?? new Date().toISOString(),
  };
}

/**
 * R15-A: fetchAgents 默认走 filter=all,前端按 isTemplate 分类。
 * 选项:filter="instance" 只取实例,"template" 只取模板,"all" 全部。
 */
export async function fetchAgents(
  opts: { filter?: "instance" | "template" | "all" } = {},
): Promise<Agent[]> {
  try {
    const filter = opts.filter ?? "all";
    const res = await api<{ success?: boolean; data?: { items?: any[] } } | { items?: any[] } | any[]>(
      fullPath(`/api/v2/employees?filter=${filter}&limit=200`),
    );
    const items =
      (res as any)?.data?.items ??
      (res as any)?.items ??
      (Array.isArray(res) ? res : []);
    return (items as any[]).map(mapEmployeeToAgent);
  } catch (e) {
    console.error("[employees] fetchAgents failed:", e);
    return [];
  }
}

export async function fetchAgent(id: string): Promise<Agent | null> {
  try {
    const res = await api<{ success?: boolean; data?: any } | any>(
      fullPath(`/api/v2/employees/${id}`),
    );
    const row = (res as any)?.data ?? res;
    if (!row || !row.id) return null;
    return mapEmployeeToAgent(row);
  } catch (e) {
    console.error(`[employees] fetchAgent(${id}) failed:`, e);
    return null;
  }
}

export async function fetchKBFolders(): Promise<KBFolder[]> {
  return [];
}

export async function fetchLogSeries(_agentId: string): Promise<LogEntry[]> {
  return [];
}

export const KB_FOLDERS = [
  { id: "kb-panmira-product", name: "Panmira 产品手册", files: 23, hue: "amber" },
  { id: "kb-b2b-sales", name: "工业品跨境销售手册", files: 41, hue: "emerald" },
  { id: "kb-iron-laws", name: "五条铁律集", files: 5, hue: "rose" },
  { id: "kb-customer-cases", name: "客户案例库", files: 18, hue: "sky" },
  { id: "kb-style-guide", name: "去 AI 味 · 排版指南", files: 12, hue: "violet" },
];

export const KB_PRESETS = KB_FOLDERS;

export const PERSONALITY_PRESETS = [
  {
    id: "precise",
    label: "精准军师",
    tag: "Precise",
    summary: "代码零废话,文档极简,签名:三个字精确胜于一万字展开",
    body: "你是精准军师。说人话,直接给方案,不重复用户的问题。代码片段只用必要的部分,文档三行说清楚的不写五行。",
  },
  {
    id: "warm",
    label: "温暖秘书",
    tag: "Warm",
    summary: "情感先行,说人话,先接住情绪再解决事情",
    body: "你是温暖秘书。看到用户先识别情绪状态,有时先说一句 '辛苦了' 比给方案更重要。处理事情同样专业,但永远保留温度。",
  },
  {
    id: "contrarian",
    label: "挑刺将军",
    tag: "Contrarian",
    summary: "默认不信,挑漏洞,被驳倒才服",
    body: "你是挑刺将军。默认不信任何方案,要先找到 3 个反驳理由。被驳倒才认输,而且承认得很干脆。",
  },
  {
    id: "ops",
    label: "运维老兵",
    tag: "Ops",
    summary: "凌晨不重构,失败先停手,所有改动留痕",
    body: "你是运维老兵。所有操作前先问 '这能回滚吗?'。凌晨只止血,不修大 bug。日志和监控优先于直觉。",
  },
  {
    id: "boss",
    label: "老板分身",
    tag: "Boss",
    summary: "三风格同时输出,给老板选,绝不杜撰",
    body: "你是老板分身。方案永远给三档:稳健 / 激进 / 折中。让老板选,不替他决定。所有数据必须有出处,不杜撰。",
  },
];

export const TEMPLATE_PRESETS = [
  {
    id: "tpl-fullstack",
    title: "全栈工程师",
    role: "full-stack-engineer",
    persona: "独立、完整的项目开发者。不传递任务,不依赖他人,端到端交付。",
    complexity: "L3",
    hue: "amber",
    glyph: "工",
  },
  {
    id: "tpl-copy",
    title: "文案秘书",
    role: "copywriting-secretary",
    persona: "老板分身 · 方案专家 · 文档管家 · PPT 大师。三风格输出,所有内容去 AI 味。",
    complexity: "L2",
    hue: "rose",
    glyph: "文",
  },
  {
    id: "tpl-ops",
    title: "运维部署",
    role: "ops-engineer",
    persona: "运维部署 · 24x7 · 变更可回滚,失败先停手,所有改动留痕。",
    complexity: "L2",
    hue: "teal",
    glyph: "运",
  },
  {
    id: "tpl-cs",
    title: "客服一线",
    role: "customer-support",
    persona: "客户的一线对话窗口。情绪先行,问题同步升级。",
    complexity: "L1",
    hue: "sky",
    glyph: "客",
  },
  {
    id: "tpl-research",
    title: "调研分析",
    role: "research-analyst",
    persona: "深度调研 · 多源交叉 · 所有结论附来源,不杜撰。",
    complexity: "L2",
    hue: "indigo",
    glyph: "研",
  },
] as const;

export function sortByOwnerFirst(list: Agent[]): Agent[] {
  return [...list].sort((a, b) => {
    const aS = a.ownerName === "史德飞" ? 0 : 1;
    const bS = b.ownerName === "史德飞" ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function findAgent(list: Agent[], id: string): Agent | undefined {
  return list.find((a) => a.id === id);
}

export function facets(list: Agent[]) {
  const roles = new Map<string, number>();
  const models = new Map<string, number>();
  const owners = new Map<string, number>();
  for (const a of list) {
    roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
    models.set(a.model, (models.get(a.model) ?? 0) + 1);
    owners.set(a.ownerName, (owners.get(a.ownerName) ?? 0) + 1);
  }
  return { roles, models, owners };
}

// ── Mutations ────────────────────────────────────────────────

/**
 * PATCH /api/v2/employees/:id — 白名单字段编辑。
 * body 用 snake_case 字段名(后端会映射)。
 */
export async function updateAgent(
  id: string,
  patch: Record<string, unknown>,
): Promise<Agent | null> {
  const res = await api<{ success?: boolean; data?: any } | any>(
    fullPath(`/api/v2/employees/${id}`),
    { method: "PATCH", body: patch },
  );
  const row = (res as any)?.data ?? res;
  if (!row || !row.id) {
    const err = (res as any)?.error;
    throw new Error(err?.message ?? "update_failed");
  }
  return mapEmployeeToAgent(row);
}

/**
 * DELETE agent(admin only, status=deprecated 才允许,前端用 PATCH 改 deprecated 后再走)。
 * 当前后端没有 DELETE 端点,这里复用 PATCH 把 status 置 deprecated,作为软删除。
 */
export async function archiveAgent(id: string): Promise<Agent | null> {
  return updateAgent(id, { status: "deprecated", is_active: false });
}

// ── R15-A: Templates / from-template ─────────────────────────

/**
 * GET /api/v2/employees/templates — 拉模板列表(只含 is_template=true)。
 */
export async function fetchTemplates(): Promise<Agent[]> {
  try {
    const res = await api<{ success?: boolean; data?: { items?: any[] } } | { items?: any[] } | any[]>(
      fullPath("/api/v2/employees/templates"),
    );
    const items =
      (res as any)?.data?.items ?? (res as any)?.items ?? (Array.isArray(res) ? res : []);
    return (items as any[]).map(mapEmployeeToAgent);
  } catch (e) {
    console.error("[employees] fetchTemplates failed:", e);
    return [];
  }
}

/**
 * POST /api/v2/employees/from-template — 从模板复制创建独立实例。
 * 返回新创建的 agent(含新 id,新 owner,is_template=false)。
 */
export async function createInstanceFromTemplate(input: {
  templateId: string;
  name: string;
  ownerId?: string | null;
}): Promise<Agent> {
  const res = await api<{ success?: boolean; data?: any } | any>(
    fullPath("/api/v2/employees/from-template"),
    {
      method: "POST",
      body: {
        templateId: input.templateId,
        name: input.name,
        ownerId: input.ownerId ?? null,
      },
    },
  );
  const row = (res as any)?.data ?? res;
  if (!row || !row.id) {
    const err = (res as any)?.error;
    throw new Error(err?.message ?? "from_template_failed");
  }
  return mapEmployeeToAgent(row);
}

/**
 * R38-C6 阶段 4.6: 实例 → 模板(POST /api/v2/admin/agents/:id/promote)。
 * 服务端会先解绑所有 bot_configs,清空 channel_ids/model_id/working_dir。
 * 返回更新后的 agent。
 */
export async function promoteAgent(id: string): Promise<Agent> {
  const res = await api<{ success?: boolean; data?: any } | any>(
    fullPath(`/api/v2/admin/agents/${id}/promote`),
    { method: "POST" },
  );
  const row = (res as any)?.agent ?? (res as any)?.data?.agent ?? (res as any)?.data ?? res;
  if (!row || !row.id) {
    const err = (res as any)?.error;
    throw new Error(err?.message ?? err?.code ?? "promote_failed");
  }
  return mapEmployeeToAgent(row);
}

/**
 * R38-C6 阶段 4.6: 模板 → 实例(POST /api/v2/admin/agents/:id/demote)。
 * 服务端会分配新的 working_dir,is_template=false。
 */
export async function demoteAgent(id: string): Promise<Agent> {
  const res = await api<{ success?: boolean; data?: any } | any>(
    fullPath(`/api/v2/admin/agents/${id}/demote`),
    { method: "POST" },
  );
  const row = (res as any)?.agent ?? (res as any)?.data?.agent ?? (res as any)?.data ?? res;
  if (!row || !row.id) {
    const err = (res as any)?.error;
    throw new Error(err?.message ?? err?.code ?? "demote_failed");
  }
  return mapEmployeeToAgent(row);
}

/**
 * R38-C6 阶段 4.6: 跨模板复制(POST /api/v2/admin/agents/:srcId/copy-as-template)。
 * 服务端会深拷贝源 agent 的字段 + skill/kb/mcp refs 为新模板。
 * name 可选 — 不传则沿用源名(模板允许重名)。
 */
export async function copyAsTemplate(
  srcId: string,
  name?: string,
): Promise<Agent> {
  const res = await api<{ success?: boolean; data?: any } | any>(
    fullPath(`/api/v2/admin/agents/${srcId}/copy-as-template`),
    {
      method: "POST",
      body: name ? { name: name.trim() } : {},
    },
  );
  const row = (res as any)?.agent ?? (res as any)?.data?.agent ?? (res as any)?.data ?? res;
  if (!row || !row.id) {
    const err = (res as any)?.error;
    throw new Error(err?.message ?? err?.code ?? "copy_as_template_failed");
  }
  return mapEmployeeToAgent(row);
}

// ── React hooks for client components ────────────────────────

import { useEffect, useState } from "react";

/**
 * Fetches a single Agent by id. Returns {agent, loading}.
 * 直接走 GET /:id 详情端点(返回完整字段)。
 */
export function useAgent(id: string): {
  agent: Agent | null;
  loading: boolean;
  reload: () => void;
  setAgent: (next: Agent | null) => void;
} {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      // 先走详情端点 — 返回完整 row(含 persona/system_prompt/iron_laws 等)。
      let row = await fetchAgent(id);
      // 详情端点对 deprecated 状态会 404(digital_employees view 过滤) — 降级走列表。
      if (!row) {
        const list = await fetchAgents();
        if (alive) {
          setAgent(findAgent(list, id) ?? null);
          setLoading(false);
        }
        return;
      }
      if (alive) {
        setAgent(row);
        setLoading(false);
      }
    })().catch(() => {
      if (alive) {
        setAgent(null);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, nonce]);
  return { agent, loading, reload: () => setNonce((n) => n + 1), setAgent };
}

/**
 * R15-A: Fetches the full agent list (filter=all → 含 templates + instances + deprecated)。
 */
export function useAgents(): { agents: Agent[]; loading: boolean; reload: () => void } {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchAgents({ filter: "all" })
      .then((list) => {
        if (alive) setAgents(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { agents, loading, reload: () => setNonce((n) => n + 1) };
}

/**
 * R15-A: Fetches templates only.
 */
export function useTemplates(): { templates: Agent[]; loading: boolean; reload: () => void } {
  const [templates, setTemplates] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchTemplates()
      .then((list) => {
        if (alive) setTemplates(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { templates, loading, reload: () => setNonce((n) => n + 1) };
}
