// 5 项系统健康度 — 水平 meter + 状态色
import * as React from "react";
import { Database, Zap, Wifi, Search, BrainCircuit, Server, Cpu, HardDrive, Users, type LucideIcon } from "lucide-react";

export interface HealthItem {
  name: string;
  status: "ok" | "warn" | "error";
  value: string;
  threshold: string;
  detail?: Record<string, unknown>;
}

interface Props {
  items: HealthItem[];
}

const STATUS_COLOR: Record<HealthItem["status"], string> = {
  ok: "oklch(0.65 0.15 150)",
  warn: "oklch(0.72 0.15 75)",
  error: "oklch(0.60 0.20 25)",
};

const STATUS_LABEL: Record<HealthItem["status"], string> = {
  ok: "正常",
  warn: "警告",
  error: "异常",
};

function iconFor(name: string): LucideIcon {
  // R14-A: 6 new health dimensions
  if (name.includes("系统服务")) return Server;
  if (name.includes("AI") || name.includes("大模型")) return BrainCircuit;
  if (name.includes("知识库") || name.includes("RAG")) return Search;
  if (name.includes("任务执行")) return Zap;
  if (name.includes("资源")) return HardDrive;
  if (name.includes("员工")) return Users;
  // legacy fallbacks
  if (name.includes("数据库") || name.includes("DB")) return Database;
  if (name.includes("缓存")) return Zap;
  if (name.includes("WebSocket") || name.includes("websocket")) return Wifi;
  if (name.includes("Memory")) return BrainCircuit;
  return Database;
}

// 把不同维度的 value 归一化成 0-100 的进度（仅用于 meter 长度，不影响数字显示）
function percentFor(item: HealthItem): number {
  const d = (item.detail ?? {}) as Record<string, unknown>;
  // 系统服务: up/total
  if (typeof d.up === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.up / d.total) * 100);
  }
  // AI 大模型: reachable/total
  if (typeof d.reachable === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.reachable / d.total) * 100);
  }
  // 任务执行: rate
  if (typeof d.rate === "number") return Math.max(0, Math.min(100, d.rate));
  // 资源: 主要看磁盘 (低占用=健康=进度满)
  if (typeof d.diskPct === "number") {
    return Math.max(0, Math.min(100, 100 - d.diskPct));
  }
  // 正式员工活跃: active/total
  if (typeof d.active === "number" && typeof d.total === "number" && d.total > 0) {
    return Math.round((d.active / d.total) * 100);
  }
  // legacy: DB ms
  if (typeof d.ms === "number") {
    return Math.max(0, Math.min(100, ((200 - d.ms) / 150) * 100));
  }
  // legacy: percent
  if (typeof d.percent === "number") return Math.max(0, Math.min(100, d.percent));
  if (item.status === "ok") return 92;
  if (item.status === "warn") return 55;
  return 18;
}

export function HealthMeters({ items }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold tracking-tight">系统健康度</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">系统/AI/KB/任务/资源/员工 · 实时探测</p>
        </div>
        <div className="text-[11px] text-muted-foreground">
          {items.filter((i) => i.status === "ok").length}/{items.length} 正常
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {items.map((item) => {
          const Icon = iconFor(item.name);
          const color = STATUS_COLOR[item.status];
          const pct = percentFor(item);
          return (
            <li key={item.name} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
              <div className="grid size-8 place-items-center rounded-md border border-border bg-muted/30" style={{ color }}>
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium truncate">{item.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{item.threshold}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: color }}
                  />
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>
                  {item.value}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABEL[item.status]}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
