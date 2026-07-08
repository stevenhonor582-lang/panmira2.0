"use client";
import * as React from "react";
import Link from "next/link";
import {
  fetchAgents,
  updateAgent,
  sortByOwnerFirst,
  facets as buildFacets,
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

type BoardTab = "instances" | "templates";

export function GalleryBoard() {
  const [filter, setFilter] = React.useState<FilterState>(EMPTY_FILTER);
  const [mounted, setMounted] = React.useState(false);
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [boardTab, setBoardTab] = React.useState<BoardTab>("instances");

  const reload = React.useCallback(() => {
    setLoading(true);
    fetchAgents({ filter: "all" })
      .then((list) => setAgents(list))
      .finally(() => setLoading(false));
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
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // 当前 tab 数据(实例 vs 模板)
  const scopedList = React.useMemo(
    () => agents.filter((a) => (boardTab === "templates" ? a.isTemplate : !a.isTemplate)),
    [agents, boardTab],
  );

  const all = React.useMemo(() => sortByOwnerFirst(scopedList), [scopedList]);
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

  const instancesCount = agents.filter((a) => !a.isTemplate).length;
  const templatesCount = agents.filter((a) => a.isTemplate).length;

  return (
    <div className="space-y-6">
      <Header
        instancesCount={instancesCount}
        templatesCount={templatesCount}
        loading={loading}
        boardTab={boardTab}
      />

      <RoleLegend activeRole={filter.role === "all" ? null : filter.role} onPickRole={(r) => setFilter({ ...filter, role: r })} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 rounded-full bg-muted/40 p-1 ring-1 ring-border">
          <BoardTabButton
            active={boardTab === "instances"}
            onClick={() => { setBoardTab("instances"); setFilter(EMPTY_FILTER); }}
            icon={<Bot className="size-3.5" />}
            label="数字员工"
            count={instancesCount}
          />
          <BoardTabButton
            active={boardTab === "templates"}
            onClick={() => { setBoardTab("templates"); setFilter(EMPTY_FILTER); }}
            icon={<FileText className="size-3.5" />}
            label="模板库"
            count={templatesCount}
          />
        </div>

        <div className="flex items-center gap-2">
          <Link href="/employees/templates">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileText className="size-3.5" /> 模板管理
            </Button>
          </Link>
          <Link href="/employees/new">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              {boardTab === "templates" ? "新建模板" : "新建数字员工"}
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
        <EmptyState tab={boardTab} />
      ) : (
        <AsymGrid agents={list} mounted={mounted} onChanged={reload} boardTab={boardTab} />
      )}
    </div>
  );
}

function Header({
  instancesCount,
  templatesCount,
  loading,
  boardTab,
}: {
  instancesCount: number;
  templatesCount: number;
  loading: boolean;
  boardTab: BoardTab;
}) {
  return (
    <header className="flex items-end justify-between gap-6 border-b border-border pb-7">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
          <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
          数字员工 · IA v6 · R15-A
        </div>
        <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
          {boardTab === "templates" ? "模板库" : "你的数字员工画廊"}
        </h1>
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
          {boardTab === "templates"
            ? "模板是 agent 的复制基底 — 同一个销售模板可以派生出多个独立 agent,起不同名字,配给不同员工。"
            : "每个员工都是一组指令 + 一段人格 + 一条调用链。"}
          {loading ? (
            <> 正在拉取最新数据…</>
          ) : (
            <>
              {" "}共 <span className="font-mono text-foreground/90">{instancesCount}</span> 个实例 ·{" "}
              <span className="font-mono text-foreground/90">{templatesCount}</span> 个模板。
            </>
          )}
        </p>
      </div>
      <div className="hidden lg:flex shrink-0 flex-col items-end gap-2 text-right">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/40">数据源</span>
        <span className="text-sm text-foreground/80">agents 表 · 真实数据</span>
        <span className="font-mono text-[11px] text-foreground/40">
          GET /api/v2/employees?filter=all
        </span>
      </div>
    </header>
  );
}

function BoardTabButton({
  active, onClick, icon, label, count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-all",
        active
          ? "bg-foreground text-background"
          : "text-foreground/65 hover:text-foreground",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[11px] opacity-60">{count}</span>
    </button>
  );
}

// R17-3: 平级卡片网格 — 统一尺寸,不再有 feature/tall/wide 大卡
// 用户反馈:"一个特别大一个很长,造成错觉"
function AsymGrid({
  agents, mounted, onChanged, boardTab,
}: {
  agents: Agent[];
  mounted: boolean;
  onChanged: () => void;
  boardTab: BoardTab;
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
            isTemplateTab={boardTab === "templates"}
          />
        </div>
      ))}
    </div>
  );
}

// 角色分工说明区 — 用户反馈:"角色分工几大类没看明白,从哪定义的?"
const ROLE_GROUPS: { key: string; label: string; desc: string; glyph: string; hue: string }[] = [
  { key: "full-stack-engineer",    label: "全栈工程师",  desc: "端到端开发,不传递任务",          glyph: "工", hue: "amber" },
  { key: "copywriting-secretary",  label: "内容创作",    desc: "文案 / PPT / 方案 / 文档管家",    glyph: "文", hue: "rose" },
  { key: "ops-engineer",           label: "运维部署",    desc: "部署 / 监控 / 24x7 / 可回滚",      glyph: "运", hue: "teal" },
  { key: "customer-support",       label: "客服支持",    desc: "客户对接 / 情绪先行 / 升级同步",   glyph: "客", hue: "sky" },
  { key: "research-analyst",       label: "调研分析",    desc: "多源交叉 / 结论附来源",           glyph: "研", hue: "indigo" },
  { key: "test-bot",               label: "测试验证",    desc: "E2E 测试 / 回归守护",             glyph: "测", hue: "lime" },
  { key: "general",                label: "通用对话",    desc: "基础对话 / 未分类角色",           glyph: "通", hue: "violet" },
  { key: "engineering",            label: "工程(legacy)",desc: "历史保留,等同 full-stack",        glyph: "E",  hue: "zinc" },
];

function RoleLegend({
  activeRole,
  onPickRole,
}: {
  activeRole: string | null;
  onPickRole: (r: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">角色分工 · 几大类</span>
          <span className="text-[12px] text-foreground/60">从哪定义? — <code className="font-mono text-[11px] text-foreground/75">agents.role_template</code></span>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          {open ? "收起 −" : "展开 +"}
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ROLE_GROUPS.map((r) => {
              const on = activeRole === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onPickRole(on ? "all" : r.key)}
                  className={
                    "group flex items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] ring-1 transition-all " +
                    (on
                      ? "bg-foreground/[0.04] ring-foreground/30"
                      : "bg-background/40 ring-border hover:ring-foreground/20")
                  }
                >
                  <span className={"mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold bg-" + r.hue + "-100 dark:bg-" + r.hue + "-900/40 text-" + r.hue + "-700 dark:text-" + r.hue + "-300"}>
                    {r.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground/85">{r.label}</span>
                    <span className="block truncate font-mono text-[10.5px] text-foreground/45">{r.key}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-foreground/65">{r.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 border-t border-border pt-2.5 text-[11px] text-foreground/55">
            <span className="font-mono text-foreground/45">说明 ·</span>{" "}
            <span className="text-foreground/75">主理人</span> 是这个员工的归属者(等同于 owner);
            <span className="text-foreground/75"> 模板</span> 标记表示当前是模板(可被复制派生实例),没有"主理(系统模板)"这一概念。
            点上面任一角色可快速筛选。
          </p>
        </div>
      )}
    </section>
  );
}

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

function EmptyState({ tab }: { tab: BoardTab }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
        No matches
      </span>
      <p className="max-w-[44ch] text-sm text-foreground/65">
        {tab === "templates"
          ? "没有匹配的模板。试着清空检索,或到模板管理页新建一个。"
          : "没有匹配的员工。试着清空检索,或从模板派生一个。"}
      </p>
    </div>
  );
}
