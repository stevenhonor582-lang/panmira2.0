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
  Plus, Briefcase, Lock, Sparkles, Search, X, Building2, Loader2,
} from "lucide-react";
import { DEPARTMENT_COLOR } from "@/lib/department-color";
import { useToast } from "@/components/toast/toast-provider";

function mapAgentToHrCard(a: Agent, usage: number): HrCardData {
  const raw = (a.raw ?? {}) as Record<string, unknown>;
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
    role: a.role,
    ironLaws: a.ironLaws ?? [],
    skills: a.skills ?? [],
    tools: a.tools ?? [],
    usageCount: usage,
  };
}

export function HrLibrary() {
  const [mounted, setMounted] = React.useState(false);
  const [custom, setCustom] = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [usageMap, setUsageMap] = React.useState<Record<string, number>>({});
  // R55-A 1.2: 检索 — 按岗位名称 / 岗位描述过滤两个 section
  const [query, setQuery] = React.useState("");
  // R56-D 1.1: 新建部门 dialog 状态
  const [deptOpen, setDeptOpen] = React.useState(false);
  const [deptName, setDeptName] = React.useState("");
  const [deptColor, setDeptColor] = React.useState<string>("#64748b");
  const [deptSubmitting, setDeptSubmitting] = React.useState(false);
  const toast = useToast();

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

  // R56-D 1.1: 提交新建部门
  const onSubmitDepartment = async () => {
    const name = deptName.trim();
    if (!name || deptSubmitting) return;
    setDeptSubmitting(true);
    try {
      const res = await fetch("/api/v2/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: deptColor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data?.error?.message ||
          data?.message ||
          (res.status === 409 ? "部门名称已存在" : "创建失败,请稍后再试");
        toast.error(`新建部门失败: ${msg}`);
        return;
      }
      toast.success(`已新建部门「${name}」`);
      setDeptOpen(false);
      setDeptName("");
      setDeptColor("#64748b");
      await loadLibrary();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "网络错误";
      toast.error(`新建部门失败: ${msg}`);
    } finally {
      setDeptSubmitting(false);
    }
  };

  // R56-B: 部门聚类 + 岗位类型筛选
  const TEMPLATE_TYPE_OPTIONS = [
    { value: "", label: "全部类型" },
    { value: "engineering", label: "工程型" },
    { value: "painting", label: "创意型" },
    { value: "copywriting", label: "文书型" },
    { value: "ops", label: "运营型" },
    { value: "business", label: "业务型" },
    { value: "research", label: "研究型" },
  ];
  const DEPT_CLUSTER = {
    工程: ["工程", "项目管理", "测试", "空间计算", "GIS", "游戏开发", "安全"],
    设计: ["设计"],
    内容: ["营销", "付费媒体", "销售", "学术"],
    运营: ["财务", "HR", "法务", "供应链", "产品", "支持", "专项"],
    研究: ["研究"],
  } as const;
  type ClusterName = keyof typeof DEPT_CLUSTER;

  // R56-B: URL 参数状态(只读 — 从 useSearchParams 读)
  const sp = React.useMemo(
    () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : ""),
    [],
  );
  const catParam = sp.get("cat") as ClusterName | null;
  const typeParam = sp.get("type") || "";

  // R56-B: tab 切换 — 写 URL ?cat=xxx
  const setCat = (cat: ClusterName | null) => {
    const u = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (cat) u.set("cat", cat);
    else u.delete("cat");
    const qs = u.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.pushState({}, "", url);
    // 触发 React re-render:用 location.search 变化
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  // R56-B: 5 类 → 部门列表(用于 chip 渲染)
  const clusterChildren = (cluster: ClusterName): readonly string[] =>
    DEPT_CLUSTER[cluster];

  const customCards = custom.map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  // R55-B 2.2: 区分系统 seed vs 个人创建 — created_by IS NOT NULL 即个人创建
  // 系统 seed 是 R52/R53 批量导入的(created_by = NULL), 个人创建走 "新建岗位" / "提炼为数字HR"
  const systemSeedCards = custom.filter((a) => {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    return raw.created_by == null;
  }).map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  const personalCards = custom.filter((a) => {
    const raw = (a.raw ?? {}) as Record<string, unknown>;
    return raw.created_by != null;
  }).map((a) => mapAgentToHrCard(a, usageMap[a.id] ?? 0));

  // R55-A 1.2: 命中判断 — 岗位名称 / 显示名 / 角色 / 描述 / 人格 任一包含 query(不区分大小写)
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
  const trimmedQuery = query.trim();
  // R56-B: 部门 + 类型过滤
  const byCluster = (hr: HrCardData) => !catParam || (DEPT_CLUSTER[catParam] as readonly string[]).includes(hr.category);
  const byType = (hr: HrCardData) => !typeParam || hr.category === typeParam;
  const filteredSystemSeed = systemSeedCards.filter((hr) => matches(hr, trimmedQuery) && byCluster(hr) && byType(hr));
  const filteredPersonal = personalCards.filter((hr) => matches(hr, trimmedQuery) && byCluster(hr) && byType(hr));
  const totalMatched = filteredSystemSeed.length + filteredPersonal.length;

  // R56-D 1.1: 19 色预设(去重) + 自定义 hex 输入
  const presetColors = React.useMemo(
    () => Object.values(DEPARTMENT_COLOR).filter((c, i, arr) => arr.indexOf(c) === i),
    [],
  );

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
            <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
            数字HR · 岗位库
          </div>
          <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
            招人之前,先选岗位
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
            岗位(HR)是静态配方 — 决定一个数字员工是什么样的人:人格 / 系统提示词 / 风格 / 铁律 / 分类 / 角色。
            具体的怎么工作(模型 / 技能 / MCP / 知识库 / 入口 / 记忆 / 频道)在招聘时再填。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* R56-D 1.1: 新建部门按钮 — 触发 dialog */}
          <button
            type="button"
            onClick={() => setDeptOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-muted px-5 py-2.5 text-[13px] font-medium text-foreground hover:bg-muted/70"
            data-testid="hr-new-department"
          >
            <Building2 className="size-4" /> 新建部门
          </button>
          <Link
            href="/employees/hr/new?mode=blank"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:opacity-90"
            data-testid="hr-new"
          >
            <Plus className="size-4" /> 新建 HR
          </Link>
        </div>
      </header>

      {/* R56-D 1.1: 新建部门 Dialog — 名称 + 颜色 */}
      {deptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deptSubmitting) setDeptOpen(false);
          }}
          data-testid="hr-new-department-dialog"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
                  <Building2 className="size-3" /> 新建部门
                </div>
                <h2 className="text-lg font-semibold tracking-tight">新建一个部门</h2>
                <p className="text-[12.5px] text-foreground/55">
                  部门用于把岗位归类。颜色用于卡片描边与 icon。
                </p>
              </div>
              <button
                type="button"
                onClick={() => !deptSubmitting && setDeptOpen(false)}
                aria-label="关闭"
                className="rounded-md p-1 text-foreground/50 hover:bg-foreground/5 disabled:opacity-40"
                disabled={deptSubmitting}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <div className="space-y-2">
                <label
                  htmlFor="dept-name"
                  className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55"
                >
                  部门名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  id="dept-name"
                  type="text"
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !deptSubmitting) onSubmitDepartment();
                  }}
                  placeholder="例如:前端工程"
                  maxLength={50}
                  autoFocus
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-1 focus:ring-foreground/40"
                  data-testid="hr-new-department-name"
                />
                <p className="text-[11px] text-foreground/45">
                  同租户内不可重名,创建后可在「岗位」里挂到该部门下。
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                  部门颜色
                </label>
                <div className="flex flex-wrap gap-2">
                  {presetColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDeptColor(c)}
                      aria-label={`选择颜色 ${c}`}
                      className={
                        "size-7 rounded-full ring-2 transition-all " +
                        (deptColor.toLowerCase() === c.toLowerCase()
                          ? "ring-foreground scale-110"
                          : "ring-transparent hover:scale-105")
                      }
                      style={{ backgroundColor: c }}
                      data-testid={`hr-dept-color-${c}`}
                    />
                  ))}
                  <label
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider text-foreground/55 cursor-pointer hover:bg-foreground/5 " +
                      (presetColors.includes(deptColor) ? "" : "ring-2 ring-foreground")
                    }
                  >
                    <span
                      className="inline-block size-3.5 rounded-full ring-1 ring-border"
                      style={{ backgroundColor: deptColor }}
                    />
                    自定义
                    <input
                      type="color"
                      value={deptColor}
                      onChange={(e) => setDeptColor(e.target.value)}
                      className="sr-only"
                      data-testid="hr-dept-color-custom"
                    />
                  </label>
                </div>
                <p className="text-[11px] text-foreground/45">
                  当前:{deptColor}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
              <button
                type="button"
                onClick={() => setDeptOpen(false)}
                disabled={deptSubmitting}
                className="rounded-full px-4 py-2 text-[13px] text-foreground/65 hover:bg-foreground/5 disabled:opacity-40"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onSubmitDepartment}
                disabled={deptSubmitting || !deptName.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-40"
                data-testid="hr-new-department-submit"
              >
                {deptSubmitting && <Loader2 className="size-3.5 animate-spin" />}
                {deptSubmitting ? "提交中" : "提交"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* R55-A 1.2: HR 库检索条 — 按岗位名称 / 岗位描述过滤两个 section */}
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
              / {(systemSeedCards.length + personalCards.length).toString().padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

            {/* R56-B: 5 大类 tab + 6 岗位类型 select */}
      <div className="flex flex-wrap items-center gap-3" data-testid="hr-tabs">
        {(["全部", "工程", "设计", "内容", "运营", "研究"] as const).map((c) => {
          const key = c === "全部" ? null : (c as ClusterName);
          const active = key === catParam || (c === "全部" && !catParam);
          const color = key ? DEPT_CLUSTER[key][0] ? "#94a3b8" : "#94a3b8" : "#94a3b8";
          const tabColor = key ? "#2563eb" : "#94a3b8";
          return (
            <button
              key={c}
              type="button"
              onClick={() => setCat(key)}
              data-testid={`hr-tab-${c}`}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[12.5px] font-medium transition-colors " +
                (active
                  ? "bg-foreground text-background"
                  : "bg-muted text-foreground/70 hover:bg-muted/70")
              }
            >
              {c}
            </button>
          );
        })}
        <span className="mx-1 text-foreground/25">·</span>
        <select
          aria-label="岗位类型"
          value={typeParam}
          onChange={(e) => {
            const u = new URLSearchParams(window.location.search);
            if (e.target.value) u.set("type", e.target.value);
            else u.delete("type");
            const qs = u.toString();
            window.history.pushState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }}
          data-testid="hr-type-filter"
          className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
        >
          {TEMPLATE_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* R56-B: 选中 tab 下的 19 子部门 chip 标签 */}
      {catParam && (
        <div className="flex flex-wrap items-center gap-2" data-testid="hr-dept-chips">
          {clusterChildren(catParam).map((dept) => (
            <span
              key={dept}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium"
              style={{
                borderColor: "#94a3b8",
                color: "#475569",
                background: "#f8fafc",
              }}
              data-testid={`hr-dept-chip-${dept}`}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: "#94a3b8" }}
              />
              {dept}
            </span>
          ))}
        </div>
      )}

      <section className="space-y-5">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Lock className="size-3" /> 系统岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              R52/R53 内置岗位 · {loading ? "…" : filteredSystemSeed.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              19 个部门 · 266 个岗位 · 系统 seed (created_by = NULL)
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredSystemSeed.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              {systemSeedCards.length === 0 ? "暂无系统岗位" : "检索无匹配岗位"}
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[40ch]">
              {systemSeedCards.length === 0
                ? "系统在导入岗位数据,请稍后再来。"
                : "试试清空检索,或换个关键词。"}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Link
                href="/employees/hr/new?mode=blank"
                className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
              >
                <Plus className="size-3.5" /> 新建 HR
              </Link>
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
            {filteredSystemSeed.map((hr, i) => (
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
      <section className="space-y-5" data-testid="hr-personal-section">
        <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
          <div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
              <Briefcase className="size-3" /> 个人创建的岗位
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              我自己创建的岗位 · {loading ? "…" : filteredPersonal.length} 个
            </h2>
            <p className="mt-1 text-[12.5px] text-foreground/55">
              从员工详情页"提炼为数字HR"或直接"新建岗位"得到 · 只显示当前用户创建的
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-56 rounded-3xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : filteredPersonal.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-12 text-center">
            <Briefcase className="size-5 text-foreground/40" />
            <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
              暂无个人创建的岗位
            </p>
            <p className="text-[13px] text-foreground/55 max-w-[44ch]">
              你创建的岗位会出现在这里。可以从员工详情页"提炼为数字HR"生成,或者直接新建一个空白岗位。
            </p>
            <Link
              href="/employees/hr/new?mode=blank"
              className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
            >
              <Plus className="size-3.5" /> 新建 HR
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredPersonal.map((hr, i) => (
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
