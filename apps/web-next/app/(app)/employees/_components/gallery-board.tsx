"use client";
import * as React from "react";
import {
  fetchAgents,
  sortByOwnerFirst,
  facets as buildFacets,
  type Agent,
} from "../_lib/data";
import { AgentCard, type AgentCardSize } from "./agent-card";
import { FilterBar, type FilterState, EMPTY_FILTER } from "./filter-bar";

const ROLE_LABEL: Record<string, string> = {
  "full-stack-engineer": "全栈工程",
  "copywriting-secretary": "文案秘书",
  "ops-engineer": "运维部署",
  general: "通用对话",
  "test-bot": "端到端测试",
  engineering: "工程(legacy)",
};

export function GalleryBoard() {
  const [filter, setFilter] = React.useState<FilterState>(EMPTY_FILTER);
  const [mounted, setMounted] = React.useState(false);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
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

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  const all = React.useMemo(() => sortByOwnerFirst(agents), [agents]);
  const list = React.useMemo(() => {
    return all.filter((a) => {
      if (filter.role !== "all" && a.role !== filter.role) return false;
      if (filter.model !== "all" && a.model !== filter.model) return false;
      if (filter.status !== "all" && a.status !== filter.status) return false;
      if (filter.owner !== "all" && a.ownerName !== filter.owner) return false;
      if (filter.query) {
        const q = filter.query.toLowerCase();
        if (
          !a.displayName.toLowerCase().includes(q) &&
          !a.name.toLowerCase().includes(q) &&
          !a.role.toLowerCase().includes(q) &&
          !(ROLE_LABEL[a.role] ?? "").includes(q)
        )
          return false;
      }
      return true;
    });
  }, [all, filter]);

  const facetData = React.useMemo(() => {
    const f = buildFacets(all);
    return {
      roles: [...f.roles.entries()].sort((a, b) => b[1] - a[1]),
      models: [...f.models.entries()],
      owners: [...f.owners.entries()],
    };
  }, [all]);

  return (
    <div className="space-y-8">
      <Header count={agents.length} loading={loading} />

      <FilterBar
        value={filter}
        onChange={setFilter}
        facets={facetData}
        resultCount={list.length}
      />

      {loading ? (
        <LoadingGrid />
      ) : list.length === 0 ? (
        <EmptyState />
      ) : (
        <AsymGrid agents={list} mounted={mounted} />
      )}
    </div>
  );
}

function Header({ count, loading }: { count: number; loading: boolean }) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border pb-7">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          数字员工 · IA v6
        </div>
        <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
          你的数字员工画廊
        </h1>
        <p className="max-w-[55ch] text-[15px] leading-relaxed text-foreground/65">
          每个员工都是一组指令 + 一段人格 + 一条调用链。
          {loading ? (
            <>正在拉取最新员工…</>
          ) : (
            <>
              这里一共 <span className="font-mono text-foreground/90">{count}</span> 个。
            </>
          )}
        </p>
      </div>
      <div className="hidden lg:flex shrink-0 flex-col items-end gap-2 text-right">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/40">
          数据源
        </span>
        <span className="text-sm text-foreground/80">digital_employees view</span>
        <span className="font-mono text-[11px] text-foreground/40">
          GET /api/v2/employees
        </span>
      </div>
    </header>
  );
}

function AsymGrid({ agents, mounted }: { agents: Agent[]; mounted: boolean }) {
  const layout: AgentCardSize[] = [
    "feature",
    "regular",
    "compact",
    "regular",
    "tall",
    "wide",
    "regular",
    "compact",
  ];

  return (
    <div className="grid auto-rows-[180px] grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {agents.map((a, i) => (
        <div
          key={a.id}
          className={
            "transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4") +
            " " +
            (layout[i] === "feature"
              ? "col-span-2 row-span-2"
              : layout[i] === "wide"
              ? "col-span-2"
              : layout[i] === "tall"
              ? "row-span-2"
              : "")
          }
          style={{
            transitionDelay: mounted ? `${i * 50}ms` : "0ms",
          }}
        >
          <AgentCard agent={a} size={layout[i]} />
        </div>
      ))}
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid auto-rows-[180px] grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="col-span-1 row-span-1 rounded-3xl bg-muted/40 ring-1 ring-border animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        No matches
      </span>
      <p className="max-w-[36ch] text-sm text-foreground/65">
        没有匹配的 bot。
        试着清空检索,或换一组筛选。
      </p>
    </div>
  );
}
