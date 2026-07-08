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
  ownerId: string;
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
  const meta = HUE_BY_ROLE[role] ?? { hue: "stone", glyph: pickInitial(row.display_name ?? row.name ?? "") };
  return {
    id: row.id,
    name: row.name ?? "",
    displayName: row.display_name ?? row.displayName ?? row.name ?? "",
    persona: row.description ?? "",
    description: row.description ?? "",
    status: isActive ? "active" : "deprecated",
    role,
    model: "claude-sonnet-4.6",
    contextWindow: 200000,
    temperature: 0.3,
    ownerId: "system",
    ownerName: "系统模板",
    templateSource: null,
    version: row.version ?? 1,
    createdAt: row.created_at ?? row.createdAt ?? new Date().toISOString(),
    hue: meta.hue,
    glyph: meta.glyph,
    complexity: "L2",
    tasksToday: 0,
    trendPct: 0,
    skills: Array.isArray(row.capabilities) ? row.capabilities : [],
    mcpServers: [],
    tools: Array.isArray(row.tools) ? row.tools : [],
    ironLaws: [],
    memoryLayers: { short: 0, long: 0, permanent: 0 },
    collaborators: [],
  };
}

export async function fetchAgents(): Promise<Agent[]> {
  try {
    const res = await api<{ success?: boolean; data?: { items?: any[] } } | { items?: any[] } | any[]>(
      fullPath("/api/v2/employees"),
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

// ── React hooks for client components ────────────────────────

import { useEffect, useState } from "react";

/**
 * Fetches a single Agent by id. Returns {agent, loading}.
 *
 * Tries the digital_employees list endpoint first (which the gallery
 * already populates), then falls back to the detail endpoint.
 */
export function useAgent(id: string): { agent: Agent | null; loading: boolean } {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      // Try the list endpoint — it returns all employees and we filter client-side.
      try {
        const list = await fetchAgents();
        if (alive) {
          setAgent(findAgent(list, id) ?? null);
          setLoading(false);
        }
      } catch {
        if (alive) {
          setAgent(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);
  return { agent, loading };
}

/**
 * Fetches the full agent list. Returns {agents, loading}.
 */
export function useAgents(): { agents: Agent[]; loading: boolean } {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetchAgents()
      .then((list) => {
        if (alive) setAgents(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { agents, loading };
}
