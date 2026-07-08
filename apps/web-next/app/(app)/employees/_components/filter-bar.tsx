"use client";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, X } from "lucide-react";

export interface FilterState {
  query: string;
  role: string;
  model: string;
  status: string;
  owner: string;
}

export const EMPTY_FILTER: FilterState = {
  query: "",
  role: "all",
  model: "all",
  status: "all",
  owner: "all",
};

export function FilterBar({
  value,
  onChange,
  facets,
  resultCount,
}: {
  value: FilterState;
  onChange: (v: FilterState) => void;
  facets: {
    roles: [string, number][];
    models: [string, number][];
    owners: [string, number][];
  };
  resultCount: number;
}) {
  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm">
      <div className="flex items-center gap-3 p-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl bg-background/80 px-3 py-2 ring-1 ring-border">
          <Search className="size-3.5 text-foreground/40" />
          <input
            type="text"
            value={value.query}
            onChange={(e) => set("query", e.target.value)}
            placeholder="按名字 / 角色 / 模型 检索"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
          />
          {value.query && (
            <button
              onClick={() => set("query", "")}
              aria-label="清除检索"
              className="rounded-md p-0.5 text-foreground/40 hover:bg-foreground/5"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Stat label="结果" value={resultCount.toString().padStart(2, "0")} />
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border px-4 py-3">
        <Group label="角色">
          <Pill active={value.role === "all"} onClick={() => set("role", "all")}>
            全部 {facets.roles.reduce((s, [, n]) => s + n, 0)}
          </Pill>
          {facets.roles.map(([r, n]) => (
            <Pill key={r} active={value.role === r} onClick={() => set("role", r)}>
              {r} · {n}
            </Pill>
          ))}
        </Group>
        <Group label="模型">
          <Pill active={value.model === "all"} onClick={() => set("model", "all")}>全部</Pill>
          {facets.models.map(([m, n]) => (
            <Pill key={m} active={value.model === m} onClick={() => set("model", m)}>
              {m.split("-").slice(0, 2).join(" ")} · {n}
            </Pill>
          ))}
        </Group>
        <Group label="状态">
          <Pill active={value.status === "all"} onClick={() => set("status", "all")}>全部</Pill>
          {["active", "paused", "draft", "deprecated"].map((s) => (
            <Pill key={s} active={value.status === s} onClick={() => set("status", s)}>
              {s}
            </Pill>
          ))}
        </Group>
        <Group label="主理人">
          <Pill active={value.owner === "all"} onClick={() => set("owner", "all")}>全部</Pill>
          {facets.owners.map(([o, n]) => (
            <Pill key={o} active={value.owner === o} onClick={() => set("owner", o)}>
              {o} · {n}
            </Pill>
          ))}
        </Group>
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-2.5 py-1 text-[12.5px] font-medium transition-colors ring-1",
        active
          ? "bg-foreground text-background ring-foreground"
          : "bg-background text-foreground/70 ring-border hover:text-foreground hover:ring-foreground/30",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1 rounded-xl bg-background/80 px-3 py-1.5 ring-1 ring-border">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">{label}</span>
      <span className="font-mono text-sm tabular-nums text-foreground">{value}</span>
    </div>
  );
}
