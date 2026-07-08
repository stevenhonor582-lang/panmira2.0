
// /overview 共享数据适配层
// 适配 backend 返回的不同响应结构,提供稳定的 view-model 给页面组件。
import { api } from "@/lib/api";

// 在客户端请求 API 时,优先用 NEXT_PUBLIC_API_BASE (build-time inlined)
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
function fullPath(p: string): string {
  if (!API_BASE) return p;
  if (p.startsWith("http")) return p;
  return API_BASE + p;
}

export type EmployeeStatus = "active" | "paused" | "departed" | "deleted";

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
  // R11 新字段
  department?: string | null;
  position?: string | null;
  employeeStatus?: EmployeeStatus;
  createdAt?: string;
}

export interface PersonActivity {
  agents: number;
  pipelines: number;
  calls24h: number;
}

// 状态中文映射
export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: "在职",
  paused: "停用",
  departed: "离职",
  deleted: "已删除",
};

export const ROLE_LABEL: Record<Person["role"], string> = {
  admin: "管理员",
  operator: "操作员",
  member: "成员",
};

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

export async function fetchPeople(status?: EmployeeStatus): Promise<Person[]> {
  const url = status ? `/api/auth/users?status=${status}` : "/api/auth/users";
  const res = await api<{ users?: Person[] } | Person[]>(fullPath(url));
  if (Array.isArray(res)) return res as Person[];
  return res.users ?? [];
}

export async function fetchPersonActivity(id: string): Promise<PersonActivity> {
  try {
    const res = await api<PersonActivity>(fullPath(`/api/auth/users/${id}/activity`));
    return res ?? { agents: 0, pipelines: 0, calls24h: 0 };
  } catch {
    return { agents: 0, pipelines: 0, calls24h: 0 };
  }
}

// R11: PATCH 员工字段
export async function patchPerson(
  id: string,
  patch: {
    isActive?: boolean;
    employeeStatus?: EmployeeStatus;
    department?: string | null;
    position?: string | null;
    role?: Person["role"];
    phone?: string | null;
    unlock?: boolean;
  },
): Promise<Person | null> {
  const res = await api<{ user: Person }>(fullPath(`/api/auth/users/${id}`), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return res?.user ?? null;
}

export async function resetPersonPassword(id: string, newPassword: string): Promise<boolean> {
  try {
    await api(fullPath(`/api/auth/users/${id}/reset-password`), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function deletePerson(id: string): Promise<boolean> {
  try {
    await api(fullPath(`/api/auth/users/${id}`), { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export async function createPerson(payload: {
  name: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
  role?: Person["role"];
  employeeStatus?: EmployeeStatus;
  password?: string;
  agentIds?: string[];
  pipelineIds?: string[];
}): Promise<{ user: Person; generatedPassword?: string } | null> {
  const res = await api<{ user: Person; generatedPassword?: string }>(
    fullPath("/api/auth/users"),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  return res ?? null;
}

export async function fetchPerson(id: string): Promise<Person | null> {
  const people = await fetchPeople();
  return people.find((p) => p.id === id) ?? null;
}

export async function fetchAgents(): Promise<DigitalEmployee[]> {
  const res = await api<{ agents?: DigitalEmployee[] } | DigitalEmployee[]>(
    fullPath("/api/v2/admin/agents"),
  );
  if (Array.isArray(res)) return res as DigitalEmployee[];
  return res.agents ?? [];
}

export async function fetchAgent(id: string): Promise<DigitalEmployee | null> {
  const list = await fetchAgents();
  return list.find((a) => a.id === id) ?? null;
}

export async function fetchPipelines(): Promise<Pipeline[]> {
  const res = await api<{ data?: Pipeline[] } | Pipeline[]>(fullPath("/api/v2/admin/pipelines"));
  if (Array.isArray(res)) return res as Pipeline[];
  return res.data ?? [];
}

export async function fetchTasksStats(): Promise<TasksStats | null> {
  try {
    const res = await api<{ data?: TasksStats } | TasksStats>(fullPath("/api/v2/tasks/stats"));
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
    const res = await api<{ data?: any }>(fullPath("/api/v2/admin/agent-run-logs/stats"));
    return res.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchCost(): Promise<CostBreakdown | null> {
  try {
    const res = await api<CostBreakdown>(fullPath("/api/v2/admin/cost"));
    return res ?? null;
  } catch {
    return null;
  }
}

export async function fetchActivityEvents(limit = 20): Promise<ActivityEvent[]> {
  try {
    const res = await api<{ events?: ActivityEvent[] } | ActivityEvent[]>(
      fullPath(`/api/activity/events?limit=${limit}`),
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
