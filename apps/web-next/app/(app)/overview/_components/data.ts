// /overview 共享数据适配层
// 适配 backend 返回的不同响应结构,提供稳定的 view-model 给页面组件。
import { api } from "@/lib/api";

export interface Person {
  id: string;
  email: string;
  name: string;
  role: "admin" | "operator" | "member";
  isActive: boolean;
  avatarUrl: string | null;
  sid: string | null;
  phone: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt?: string;
}

export interface DigitalEmployee {
  id: string;
  name: string;
  displayName: string | null;
  roleTemplate: string | null;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deploymentType: string | null;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
  createdBy: string | null;
  runCount: number;
  successCount: number;
}

export interface ActivityEvent {
  id: string;
  type: string;
  botName: string | null;
  chatId: string | null;
  userId: string | null;
  prompt: string | null;
  responsePreview: string | null;
  createdAt?: string;
}

export interface TasksStats {
  pipelines_total: number;
  pipelines_active: number;
  scheduled_total: number;
  scheduled_active: number;
  running: number;
}

export interface CostBreakdown {
  totalLast30d: number;
  breakdown: Array<{ date: string; dimension: string; cost: string | number }>;
}

// --- fetchers -----------------------------------------------------------

export async function fetchPeople(): Promise<Person[]> {
  const res = await api<{ users?: Person[] } | Person[]>("/api/auth/users");
  if (Array.isArray(res)) return res as Person[];
  return res.users ?? [];
}

export async function fetchPerson(id: string): Promise<Person | null> {
  const people = await fetchPeople();
  return people.find((p) => p.id === id) ?? null;
}

export async function fetchAgents(): Promise<DigitalEmployee[]> {
  const res = await api<{ agents?: DigitalEmployee[] } | DigitalEmployee[]>(
    "/api/v2/admin/agents",
  );
  if (Array.isArray(res)) return res as DigitalEmployee[];
  return res.agents ?? [];
}

export async function fetchAgent(id: string): Promise<DigitalEmployee | null> {
  const list = await fetchAgents();
  return list.find((a) => a.id === id) ?? null;
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await api<{ data?: Pipeline[] } | Pipeline[]>("/api/v2/admin/pipelines");
  if (Array.isArray(res)) return res as Pipeline[];
  return res.data ?? [];
}

export async function fetchTasksStats(): Promise<TasksStats | null> {
  try {
    const res = await api<{ data?: TasksStats } | TasksStats>("/api/v2/tasks/stats");
    if ("data" in (res as any) && (res as any).data) return (res as any).data;
    return res as TasksStats;
  } catch {
    return null;
  }
}

export async function fetchRunLogStats(): Promise<{
  total: number;
  today: number;
  successCount: number;
  successRate: number;
  totalTokens: number;
} | null> {
  try {
    const res = await api<{ data?: any }>("/api/v2/admin/agent-run-logs/stats");
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchCost(): Promise<CostBreakdown | null> {
  try {
    const res = await api<CostBreakdown>("/api/v2/admin/cost");
    return res ?? null;
  } catch {
    return null;
  }
}

export async function fetchActivityEvents(limit = 20): Promise<ActivityEvent[]> {
  try {
    const res = await api<{ events?: ActivityEvent[] } | ActivityEvent[]>(
      `/api/activity/events?limit=${limit}`,
    );
    if (Array.isArray(res)) return res;
    return res.events ?? [];
  } catch {
    return [];
  }
}

// --- derived helpers ----------------------------------------------------

export function classifyPerson(p: Person): {
  status: "active" | "paused" | "busy" | "offline" | "error";
  reason: string;
} {
  if (!p.isActive) return { status: "offline", reason: "账号停用" };
  if (p.lockedUntil && new Date(p.lockedUntil) > new Date()) {
    return { status: "error", reason: "账号锁定" };
  }
  if (p.role === "admin") return { status: "busy", reason: "管理员在岗" };
  if (p.role === "operator") return { status: "active", reason: "操作员在岗" };
  return { status: "active", reason: "成员在岗" };
}

export function deriveAgentStatus(a: DigitalEmployee): "active" | "paused" | "deprecated" {
  if (!a.isActive) return "paused";
  if (a.roleTemplate === "full-stack-engineer" && a.deploymentType !== "bot") return "deprecated";
  return "active";
}

// 把 cost breakdown 转成 30 天聚合 (按 date 聚合所有 dimension)
export function aggregateCostDaily(breakdown: CostBreakdown["breakdown"]): Array<{ date: string; total: number }> {
  const map = new Map<string, number>();
  for (const b of breakdown) {
    const val = typeof b.cost === "string" ? parseFloat(b.cost) : b.cost;
    if (!Number.isFinite(val)) continue;
    map.set(b.date, (map.get(b.date) ?? 0) + val);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total: Math.round(total * 1000) / 1000 }));
}
