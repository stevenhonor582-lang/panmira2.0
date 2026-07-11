"use client";
import * as React from "react";
import Link from "next/link";
import {
  fetchAgents,
  fetchTemplates,
  sortByOwnerFirst,
  facets as buildFacets,
  fetchActiveRunsByAgent,
  type Agent,
} from "../_lib/data";
import { AgentCard, type AgentCardSize } from "./agent-card";
import { FilterBar, type FilterState, EMPTY_FILTER } from "./filter-bar";
import { cn } from "@/lib/utils";
import {
  Plus, FileText, Bot, MoreVertical, Pause, Play, Archive, Copy, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const ROLE_LABEL: Record<string, string> = {
  "full-stack-engineer": "全栈工程",
  "copywriting-secretary": "文案秘书",
  "ops-engineer": "运维部署",
  general: "通用对话",
  "test-bot": "端到端测试",
  engineering: "工程(legacy)",
  "customer-support": "客服一线",
  "research-analyst": "调研分析",
};

// R66-A 2.1: 删 in-page "HR 库" tab — 改由 /employees/hr 独立页承担,首页只展示数字员工实例
export function GalleryBoard() {
  const [filter, setFilter] = React.useState<FilterState>(EMPTY_FILTER);
  const [mounted, setMounted] = React.useState(false);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  // R51-E1: 当前正在 run 的 agent id 集合(用于卡片显示 "工作中")
  const [workingIds, setWorkingIds] = React.useState<Record<string, true>>({});
  // R53-T7.2: HR id → HR 显示名 映射(实例卡显示"岗位"标签用)
  const [hrNameMap, setHrNameMap] = React.useState<Record<string, string>>({});

  const reload = React.useCallback(() => {
    setLoading(true);
    fetchAgents({ filter: "all" })
      .then((list) => setAgents(list))
      .finally(() => setLoading(false));
    fetchActiveRunsByAgent().then(setWorkingIds).catch(() => setWorkingIds({}));
  }, []);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchAgents({ filter: "all" })
      .then((list) => {
        if (alive) setAgents(list);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    fetchActiveRunsByAgent()
      .then((m) => { if (alive) setWorkingIds(m); })
      .catch(() => { if (alive) setWorkingIds({}); });
    // R53-T7.2: 拉 HR 列表,构建 id → 显示名 映射
    fetchTemplates()
      .then((list) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const t of list) {
          if (t.id) map[t.id] = t.displayName || t.name || t.id.slice(0, 8);
        }
        setHrNameMap(map);
      })
      .catch(() => { if (alive) setHrNameMap({}); });
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // R66-A 2.1: 只显示实例(HR 库已迁到 /employees/hr 独立页)
  const all = React.useMemo(
    () => sortByOwnerFirst(agents.filter((a) => !a.isTemplate)),
    [agents],
  );
  const list = React.useMemo(() => {
    return all.filter((a) => {
      // R66-A 2.4: department(原 role → department)
      const rawCategory = (a.raw as Record<string, unknown> | null)?.category;
      const dept = typeof rawCategory === "string" ? rawCategory : "";
      if (filter.department !== "all" && dept !== filter.department) return false;
      if (filter.model !== "all" && a.model !== filter.model) return false;
      if (filter.status !== "all" && a.status !== filter.status) return false;
      // R66-A 2.4: 新增 workType(从 raw.template_type 读,与 hr-library 的 6 类一致)
      if (filter.workType !== "all") {
        const rawTplType = (a.raw as Record<string, unknown> | null)?.template_type;
        const tplType = typeof rawTplType === "string" ? rawTplType : "";
        // workType 工程=engineering, 创意=painting, 运营=ops|business_old, 业务=business, 研究=research, 自定义=custom
        const wtMap: Record<string, string[]> = {
          engineering: ["engineering"],
          painting:    ["painting"],
          ops:         ["ops", "copywriting"],
          business:    ["business"],
          research:    ["research"],
          custom:      ["custom"],
        };
        const allowed = wtMap[filter.workType] ?? [];
        if (!allowed.includes(tplType)) return false;
      }
      if (filter.query) {
        const q = filter.query.toLowerCase();
        if (
          !a.displayName.toLowerCase().includes(q) &&
          !a.name.toLowerCase().includes(q) &&
          !a.role.toLowerCase().includes(q) &&
          !(ROLE_LABEL[a.role] ?? "").includes(q) &&
          !dept.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [all, filter]);

  const facetData = React.useMemo(() => {
    // R66-A 2.4: facets 改为 departments + models + workTypes
    const deptMap = new Map<string, number>();
    const tplTypeMap = new Map<string, number>();
    for (const a of all) {
      const raw = (a.raw as Record<string, unknown> | null);
      const dept = typeof raw?.category === "string" ? raw.category : "";
      if (dept) deptMap.set(dept, (deptMap.get(dept) ?? 0) + 1);
      const tpl = typeof raw?.template_type === "string" ? raw.template_type : "";
      if (tpl) tplTypeMap.set(tpl, (tplTypeMap.get(tpl) ?? 0) + 1);
    }
    // workType facets:把 template_type 聚合到 6 类
    const wtBucket: Record<string, number> = {
      engineering: 0, painting: 0, ops: 0, business: 0, research: 0, custom: 0,
    };
    for (const [tt, n] of tplTypeMap.entries()) {
      const norm = tt === "copywriting" ? "ops" : tt;
      if (norm in wtBucket) wtBucket[norm] += n;
    }
    const workTypeFacets: [string, number][] = Object.entries(wtBucket).filter(([, n]) => n > 0);
    return {
      departments: [...deptMap.entries()].sort((a, b) => b[1] - a[1]),
      models: [...tplTypeMap.entries()].length === 0
        ? []
        : [...new Map(all.map((a) => [a.model || "—", 0] as [string, number])).entries()]
            .map(([m]) => {
              const n = all.filter((a) => a.model === m).length;
              return [m, n] as [string, number];
            }),
      workTypes: workTypeFacets,
    };
  }, [all]);

  const instancesCount = agents.filter((a) => !a.isTemplate).length;

  return (
    <div className="space-y-6">
      <Header
        instancesCount={instancesCount}
        loading={loading}
      />

      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* R66-A 2.1: 删 "HR 库" tab + "HR 管理" 链接(由 /employees/hr 独立页承担) */}
        <div className="inline-flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <Bot className="size-3.5" />
          <span>数字员工 · {instancesCount} 个实例</span>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/employees/hr">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="size-3.5" /> HR 库
            </Button>
          </Link>
          <Link href="/employees/new?type=instance">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> 新建数字员工
            </Button>
          </Link>
        </div>
      </div>

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
        <AsymGrid agents={list} mounted={mounted} onChanged={reload} workingIds={workingIds} hrNameMap={hrNameMap} />
      )}
    </div>
  );
}

function Header({
  instancesCount,
  loading,
}: {
  instancesCount: number;
  loading: boolean;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border pb-7">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          数字员工
        </div>
        <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
          你的数字员工矩阵
        </h1>
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
          每个员工都是一组指令 + 一段人格 + 一条调用链。
          {loading ? (
            <> 正在拉取最新数据…</>
          ) : (
            <>
              {" "}共 <span className="font-mono text-foreground/90">{instancesCount}</span> 个实例。
            </>
          )}
        </p>
      </div>
    </header>
  );
}

// R17-3: 平级卡片网格 — 统一尺寸,不再有 feature/tall/wide 大卡
// 用户反馈:"一个特别大一个很长,造成错觉"
function AsymGrid({
  agents, mounted, onChanged, workingIds, hrNameMap,
}: {
  agents: Agent[];
  mounted: boolean;
  onChanged: () => void;
  workingIds: Record<string, true>;
  hrNameMap?: Record<string, string>;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {agents.map((a, i) => (
        <div
          key={a.id}
          className={
            "h-[280px] transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
          }
          style={{ transitionDelay: mounted ? `${Math.min(i, 12) * 40}ms` : "0ms" }}
        >
          <AgentCard
            agent={a}
            size="regular"
            showManageActions
            onChanged={onChanged}
            isTemplateTab={false}
            workingIds={workingIds}
            hrNameMap={hrNameMap}
          />
        </div>
      ))}
    </div>
  );
}

// R66-A 2.3: 删 "角色分工几大类" 整行(RoleLegend + ROLE_GROUPS)

function LoadingGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="h-[280px] rounded-3xl bg-muted/40 ring-1 ring-border animate-pulse"
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
      <p className="max-w-[44ch] text-sm text-foreground/65">
        没有匹配的员工。试着清空检索,或从 HR 岗位派生一个。
      </p>
    </div>
  );
}
