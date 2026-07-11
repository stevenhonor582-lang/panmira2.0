"use client";

import * as React from "react";
import Link from "next/link";
import {
  fetchTemplates,
  fetchAgents,
  type Agent,
} from "../../_lib/data";
import { HrCard, type HrCardData } from "./hr-card";
import {
  Plus, Briefcase, Search, X,
} from "lucide-react";
import { DEPARTMENT_COLOR } from "@/lib/department-color";

// R60: 8 tab — 全部 + 6 类岗位类型 + 自定义
// - 全部:全部岗位(任一 source + 任一 is_active)
// - 6 类:templateType = 该类型
// - 自定义:source='custom
type TabKey =
  | "全部"
  | "工程型"
  | "创意型"
  | "运营型"
  | "业务型"
  | "研究型"
  | "自定义";
const TABS: readonly TabKey[] = [
  "全部",
  "工程型",
  "创意型",
  "运营型",
  "业务型",
  "研究型",
  "自定义",
] as const;

// 6 类岗位类型 → DB 字段(template_type / templateType)
const TAB_TO_TYPE: Record<TabKey, string | null> = {
  "全部": null,
  "工程型": "engineering",
  "创意型": "painting",
  "运营型": "ops",
  "业务型": "business",
  "研究型": "research",
  "自定义": null,
};

function mapAgentToHrCard(a: Agent, usage: number): HrCardData {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
  // R58: 6 类岗位类型 — 优先读 raw.template_type (DB 列) → raw.templateType → agent.templateType
  // category 仍是部门(如 "工程" / "设计"),不参与类型筛选
  const rawTemplateType =
    (typeof raw.template_type === "string" && raw.template_type) ||
    (typeof raw.templateType === "string" && raw.templateType) ||
    (typeof a.templateType === "string" && a.templateType) ||
    "";
  // R60: isActive 直接从 raw row 读
  const rawIsActive =
    (typeof raw.is_active === "boolean" && raw.is_active) ||
    (typeof raw.isActive === "boolean" && raw.isActive);
  const isActive = rawIsActive === undefined ? true : rawIsActive;
  // R58: source 来自 raw.created_by — null=系统,非 null=用户/管理员(自定义)
  const source = raw.created_by == null ? "system" : "custom";
  return {
    id: a.id,
    name: a.name,
    displayName: a.displayName || a.name,
    persona: a.persona,
    description: a.description,
    glyph: a.glyph,
    hue: a.hue,
    status: a.status,
    category: typeof raw.category === "string" ? raw.category : "general",
    templateType: rawTemplateType,
    role: a.role,
    ironLaws: a.ironLaws ?? [],
    skills: a.skills ?? [],
    tools: a.tools ?? [],
    usageCount: usage,
    isActive,
    source,
  };
}

export function HrLibrary() {
  const [mounted, setMounted] = React.useState(false);
  const [custom, setCustom] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [usageMap, setUsageMap] = React.useState<Record<string, number>>({});
  // R58: tab 改用 useState(不再写 URL ?type=)
  const [activeTab, setActiveTab] = React.useState<TabKey>("全部");
  // R58: 检索 — 只在"全部" tab 内过滤
  const [query, setQuery] = React.useState("");
  // R66-A 1.2: 业务型卡片下 chip 多选 — 仅 业务型 tab 时生效
  const [selectedBusinessDepts, setSelectedBusinessDepts] = React.useState<Set<string>>(new Set());

  const loadLibrary = React.useCallback(async () => {
    const [list, instances] = await Promise.all([
      fetchTemplates(),
      fetchAgents({ filter: "instance" }),
    ]);
    setCustom(list);
    const u: Record<string, number> = {};
    for (const inst of instances) {
      const sid = inst.templateSource;
      if (sid) u[sid] = (u[sid] ?? 0) + 1;
    }
    setUsageMap(u);
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (!alive) return;
        await loadLibrary();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [loadLibrary]);

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // R66-A 1.2: 业务型 chip 多选 toggle
  const toggleBusinessDept = (dept: string) => {
    setSelectedBusinessDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  const customCards = custom.map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  // R58: 命中判断 — 岗位名称 / 显示名 / 角色 / 描述 / 人格 任一包含 query(不区分大小写)
  const matches = (hr: HrCardData, q: string): boolean => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
      hr.name.toLowerCase().includes(needle) ||
      hr.displayName.toLowerCase().includes(needle) ||
      hr.role.toLowerCase().includes(needle) ||
      hr.description.toLowerCase().includes(needle) ||
      hr.persona.toLowerCase().includes(needle)
    );
  };

  // R61 8 tab 元数据 — 让每个 tab 看起来像独立 section(表头 + 描述 + 颜色)
  const TAB_META: Record<TabKey, { label: string; desc: string; color: string }> = {
    "全部":    { label: "全部岗位",     desc: "系统预置 + 自定义。选完即招,不卡功能。",            color: "#64748b" },
    "工程型":  { label: "工程型岗位",   desc: "编码 / 开发 / 架构 / 系统 / 安全 / 测试。",        color: "#2563eb" },
    "创意型":  { label: "创意型岗位",   desc: "设计 / 视觉 / 创作 / 渲染。",                    color: "#ec4899" },
    "运营型":  { label: "运营型岗位",   desc: "维护 / 监控 / 部署 / 故障 / 跑批。",             color: "#f97316" },
    "业务型":  { label: "业务型岗位",   desc: "销售 / 客户 / 营销 / 财务 / 供应链。",            color: "#22c55e" },
    "研究型":  { label: "研究型岗位",   desc: "调研 / 分析 / 学术 / 探索 / 报告。",             color: "#8b5cf6" },
    "自定义":  { label: "自定义岗位",   desc: "由你或管理员创建的岗位。独立来源,只属于你。",    color: "#0ea5e9" },
  };
  const activeMeta = TAB_META[activeTab];

  // R62: 7 tab 过滤(不再按 is_active 过滤,所有岗位正常显示)
  // - 全部:全部岗位,匹配 query 才显示
  // - 5 类:templateType 匹配
  // - 自定义:source=custom
  // - 运营型合并了原"文书型":templateType ∈ {ops, copywriting}
  const filteredCards = customCards.filter((hr) => {
    if (activeTab === "全部") {
      // 全部 tab 才应用检索
      return matches(hr, query.trim());
    }
    if (activeTab === "自定义") {
      return hr.source === "custom";
    }
    if (activeTab === "运营型") {
      // R62 文书型合并到运营型 — ops + copywriting 都在该 tab 显示
      return hr.templateType === "ops" || hr.templateType === "copywriting";
    }
    // 5 类岗位(工程/创意/业务/研究)
    if (hr.templateType !== TAB_TO_TYPE[activeTab]) return false;
    // R66-A 1.2: 业务型 tab 内,chip 多选过滤(营销/付费媒体/销售/财务/HR/法务)
    if (activeTab === "业务型" && selectedBusinessDepts.size > 0) {
      if (!selectedBusinessDepts.has(hr.category)) return false;
    }
    return true;
  });
  const totalMatched = filteredCards.length;
  // R58: 搜索框只在"全部" tab 卡片内过滤(其他 6 tab 不搜)
  const showSearch = activeTab === "全部";

  // R62: 19 部门 chip 标签 — 必须先于 useMemo 声明,否则工厂函数首次跑会撞 TDZ
  // (R61 把 const ALL_DEPARTMENTS 放在了 useMemo 之后,生产构建后 ALL_DEPARTMENTS
  // 被压缩成 K,首次渲染 useMemo 工厂同步求值时 K 还在 TDZ,报
  // `Uncaught ReferenceError: Cannot access 'K' before initialization`)
  const ALL_DEPARTMENTS = [
    "工程", "项目管理", "测试", "空间计算", "GIS", "游戏开发", "安全",
    "设计",
    "营销", "付费媒体", "销售", "学术",
    "财务", "HR", "法务", "供应链", "产品", "支持", "专项",
  ] as const;

  // R61 部门 chip — 跟当前 tab 内卡片实际含有的部门去重(顺序按 ALL_DEPARTMENTS 排)
  const availableDepartments = React.useMemo(() => {
    const present = new Set<string>();
    for (const hr of filteredCards) {
      if (hr.category) present.add(hr.category);
    }
    return ALL_DEPARTMENTS.filter((d) => present.has(d));
  }, [filteredCards]);

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
            <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
            数字HR · 岗位库
          </div>
          <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
            招人之前、先选岗位
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
            岗位(HR)是静态配方 — 决定一个数字员工是什么样的人:人格 / 系统提示词 / 风格 / 铁律 / 分类 / 角色。
            具体的怎么工作(模型 / 技能 / MCP / 知识库 / 入口 / 记忆 / 频道)在招聘时再填。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* R58: 新建 HR 按钮位置保持 — tab 上方(全局) */}
          <Link
            href="/employees/hr/new?mode=blank"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:opacity-90"
            data-testid="hr-new"
          >
            <Plus className="size-4" /> 新建 HR
          </Link>
        </div>
      </header>


        <div
          className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-3"
          data-testid="hr-search-bar"
        >
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-xl bg-background/80 px-3 py-2 ring-1 ring-border">
              <Search className="size-3.5 text-foreground/40" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="按岗位名称 / 岗位描述 检索"
                aria-label="检索岗位"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground/35 focus:outline-none"
                data-testid="hr-search-input"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="清除检索"
                  className="rounded-md p-0.5 text-foreground/40 hover:bg-foreground/5"
                  data-testid="hr-search-clear"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-baseline gap-1 rounded-xl bg-background/80 px-3 py-1.5 ring-1 ring-border">
              <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/35">命中</span>
              <span className="font-mono text-sm tabular-nums text-foreground">
                {totalMatched.toString().padStart(2, "0")}
              </span>
              <span className="text-[10.5px] font-mono text-foreground/35">
                / {customCards.length.toString().padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      )

      {/* R61: 8 tab — 全部 / 6 类岗位类型 / 自定义 — useState 切换,加卡效果 */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/40 p-2 shadow-sm" data-testid="hr-tabs">
        {TABS.map((label) => {
          const active = activeTab === label;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setActiveTab(label)}
              data-testid={`hr-tab-${label}`}
              className={
                "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[12.5px] font-medium transition-all " +
                (active
                  ? "bg-foreground text-background shadow-lg ring-2 ring-foreground/25 border-foreground -translate-y-0.5"
                  : "bg-muted/60 text-foreground/70 border-border hover:bg-muted hover:shadow-md hover:-translate-y-0.5 hover:border-foreground/30")
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* R66-A 1.2: 部门 chip — 业务型 tab 多选过滤,其他 tab 仍为展示性 chip */}
      <div className="flex flex-wrap items-center gap-2" data-testid="hr-dept-chips">
        {availableDepartments.length === 0 ? (
          <span className="text-[12.5px] text-foreground/45">此 tab 内暂无部门</span>
        ) : (
          availableDepartments.map((dept) => {
            const color = DEPARTMENT_COLOR[dept] ?? "#94a3b8";
            const isOn = activeTab === "业务型" && selectedBusinessDepts.has(dept);
            const isInteractive = activeTab === "业务型";
            return (
              <button
                key={dept}
                type="button"
                onClick={isInteractive ? () => toggleBusinessDept(dept) : undefined}
                aria-pressed={isOn}
                disabled={!isInteractive}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-all " +
                  (isInteractive ? "hover:-translate-y-0.5 cursor-pointer " : "cursor-default ") +
                  (isOn ? "ring-2 ring-offset-1 ring-offset-background " : "")
                }
                style={{
                  borderColor: color,
                  color: isOn ? "#fff" : color,
                  background: isOn ? color : `${color}0d`,
                }}
                data-testid={`hr-dept-chip-${dept}`}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ background: isOn ? "#fff" : color }}
                />
                {dept}
                {isOn && <span className="ml-0.5 text-[10px]">✓</span>}
              </button>
            );
          })
        )}
        {activeTab === "业务型" && selectedBusinessDepts.size > 0 && (
          <button
            type="button"
            onClick={() => setSelectedBusinessDepts(new Set())}
            data-testid="hr-clear-business-depts"
            className="ml-1 inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-background/60 px-2.5 py-1 text-[11.5px] text-foreground/60 hover:bg-foreground/5"
          >
            清除 {selectedBusinessDepts.size} 项
          </button>
        )}
      </div>

      {/* R61: 每个 tab 独立 section 表头 — 用 activeMeta 渲染 */}
      <section
        className="space-y-5 rounded-2xl border border-border/60 bg-card/40 p-6 shadow-sm"
        data-testid="hr-cards-section"
        style={{ borderLeftColor: activeMeta.color, borderLeftWidth: 4 }}
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div className="flex items-start gap-3">
            <div
              className="mt-1 size-2.5 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card"
              style={{ background: activeMeta.color, borderColor: activeMeta.color }}
            />
            <div>
              <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
                <Briefcase className="size-3" /> {activeMeta.label}
              </div>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                {activeMeta.label} · {loading ? "…" : totalMatched} 个
              </h2>
              <p className="mt-1 text-[12.5px] text-foreground/55">
                {activeMeta.desc}
              </p>
            </div>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-mono uppercase tracking-[0.18em]"
            style={{
              backgroundColor: `${activeMeta.color}1a`,
              color: activeMeta.color,
            }}
          >
            {activeTab}
          </span>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : totalMatched === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              {customCards.length === 0
                ? "暂无可用岗位"
                : showSearch && query
                ? "检索无匹配岗位"
                : "此 tab 下无岗位"}
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[40ch]">
              {customCards.length === 0
                ? "系统在导入岗位数据、请稍后再来。"
                : showSearch && query
                ? "试试清空检索、或换个关键词。"
                : "切换到其他 tab 试试、或新建一个岗位。"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/employees/hr/new?mode=blank"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
              >
                <Plus className="size-3.5" /> 新建 HR
              </Link>
              {activeTab !== "全部" && (
                <button
                  type="button"
                  onClick={() => setActiveTab("全部")}
                  className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] font-medium text-foreground/70 hover:bg-muted/70"
                >
                  回到全部
                </button>
              )}
              <Link
                href="/employees"
                className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] font-medium text-foreground/70 hover:bg-muted/70"
              >
                去员工库提炼
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredCards.map((hr, i) => (
              <div
                key={hr.id}
                className={
                  "transition-all duration-500 ease-out " +
                  (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
                }
                style={{ transitionDelay: mounted ? `${i * 50}ms` : "0ms" }}
              >
                <HrCard hr={hr} index={i} />
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
