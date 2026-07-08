// R14-D billing 共享类型 — 与后端 /api/v2/admin/billing-aggregate 对齐
export interface BillingDailyPoint {
  day: string; // YYYY-MM-DD
  input: number;
  output: number;
  total: number;
  cost: number;
}

export interface BillingEmployee {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  tokens30d: number;
  tokensToday: number;
  cost: number;
  pct: number;
}

export interface BillingAgent {
  id: string;
  name: string;
  avatarUrl: string | null;
  tokens: number;
  cost: number;
  pct: number;
}

export interface BillingSource {
  key: string;
  label: string;
  tokens: number;
  pct: number;
}

export interface BillingAggregate {
  overview: {
    today: number;
    week: number;
    month: number;
    cost30d: number;
    daily: BillingDailyPoint[];
  };
  byEmployee: BillingEmployee[];
  byAgent: BillingAgent[];
  bySource: BillingSource[];
  meta: {
    totalTokens30d: number;
    totalCost30d: number;
    employeeCount: number;
    agentCount: number;
    sourceCount: number;
  };
}

// ── 格式化辅助 ─────────────────────────────────────────────────
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "—";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

export function formatPct(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return "0%";
  return `${p.toFixed(1)}%`;
}

// 把 "得一--替补模板" 简化为 "得一" (取 "--" 之前的部分)
export function shortAgentName(name: string): string {
  if (!name) return "未命名";
  const idx = name.indexOf("--");
  return idx > 0 ? name.slice(0, idx) : name;
}
