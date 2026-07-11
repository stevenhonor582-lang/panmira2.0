"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Agent } from "../_lib/data";
import { updateAgent, createInstanceFromTemplate, promoteInstanceToTemplate, demoteTemplateToInstance, deleteAgent } from "../_lib/data";
import { AvatarMark, statusTone } from "./avatar-mark";
import {
  MoreVertical, Pause, Play, Archive, FileText, Bot, Briefcase, Loader2, Sparkles, FileUp,
  Trash2, ArrowDownToLine, Activity, Layers, Radio, Brain, Hash, Brush, PenLine, Wrench, Box,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { getDepartmentColor, DEFAULT_DEPARTMENT_COLOR } from "@/lib/department-color";
import { truncate } from "@/lib/text-truncate";

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

// R51-E1: HR 岗位分类(画 / 文 / 运 / 其它)。对齐 data.category 字段 + 默认兜底。
const CATEGORY_PRESETS: Record<string, { label: string; Icon: typeof Brush; tone: string }> = {
  art:        { label: "绘画", Icon: Brush,   tone: "bg-rose-500/10  text-rose-700  dark:text-rose-300  ring-rose-500/25" },
  copy:       { label: "文案", Icon: PenLine, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  writing:    { label: "文案", Icon: PenLine, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  ops:        { label: "运维", Icon: Wrench,  tone: "bg-teal-500/10  text-teal-700  dark:text-teal-300  ring-teal-500/25" },
  engineering:{ label: "工程", Icon: Box,     tone: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/25" },
  support:    { label: "客服", Icon: Radio,   tone: "bg-sky-500/10   text-sky-700   dark:text-sky-300   ring-sky-500/25" },
  research:   { label: "调研", Icon: Brain,   tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/25" },
  general:    { label: "通用", Icon: Layers,  tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/25" },
  custom:     { label: "其它", Icon: Layers,  tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/25" },
};

function categoryPreset(rawCategory: unknown): { key: string; label: string; Icon: typeof Brush; tone: string } {
  const key = typeof rawCategory === "string" && rawCategory.length > 0 ? rawCategory : "general";
  const preset = CATEGORY_PRESETS[key] ?? CATEGORY_PRESETS.general;
  return { key, label: preset.label, Icon: preset.Icon, tone: preset.tone };
}

// R51-E1: 运行时状态 — 待命(默认 active) / 工作(active + 当前 run) / 暂停 / 弃用
type RuntimeTone = ReturnType<typeof statusTone>;
function runtimeTone(agent: Agent, workingIds: Record<string, true>): RuntimeTone {
  if (agent.status === "paused" || agent.status === "deprecated") return statusTone(agent.status);
  // status === "active" or "draft"
  if (workingIds[agent.id]) {
    return {
      dot: "bg-emerald-400 animate-pulse",
      label: "工作中",
      chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30",
      accent: "bg-emerald-500/50",
    };
  }
  return statusTone("active");
}

// R17-3: 卡片统一尺寸 — 不再有 feature/tall/wide 区分
// 保留 AgentCardSize 类型仅为向后兼容,所有尺寸渲染相同内容
export type AgentCardSize = "feature" | "tall" | "wide" | "regular" | "compact";

export function AgentCard({
  agent,
  size = "regular",
  showManageActions = false,
  onChanged,
  isTemplateTab = false,
  workingIds,
  hrNameMap,
}: {
  agent: Agent;
  size?: AgentCardSize;
  showManageActions?: boolean;
  onChanged?: () => void;
  isTemplateTab?: boolean;
  /** R51-E1: 当前正在工作的 agent id 集合(由父层聚合) */
  workingIds?: Record<string, true>;
  /** R53-T7.2: HR id → 显示名 映射(实例卡显示"岗位"标签用) */
  hrNameMap?: Record<string, string>;
}) {
  // 静默忽略 size —— 所有卡片渲染相同布局(用户反馈:平级排列)
  const ref = React.useRef<HTMLAnchorElement>(null);
  const router = useRouter();
  const [hover, setHover] = React.useState(false);
  const [pos, setPos] = React.useState({ x: 50, y: 50 });
  const [acting, setActing] = React.useState(false);
  // R44-1: 提升为 HR dialog 状态
  const [promoteOpen, setPromoteOpen] = React.useState(false);
  const [promoteName, setPromoteName] = React.useState("");
  const [promoting, setPromoting] = React.useState(false);
  // R45-2: 转为实例 dialog 状态(hr → instance, HR 卡菜单触发)
  const [demoteOpen, setDemoteOpen] = React.useState(false);
  const [demoteName, setDemoteName] = React.useState("");
  const [demoting, setDemoting] = React.useState(false);
  // R51-E2: 删除二次确认 dialog 状态
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const toast = useToast();

  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onMove = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    setPos({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  };

  const tiltX = reduce ? 0 : (pos.y - 50) * 0.05;
  const tiltY = reduce ? 0 : (50 - pos.x) * 0.05;

  const roleLabel = ROLE_LABEL[agent.role] ?? agent.role;
  const runtimeMap = workingIds ?? {};
  const t = runtimeTone(agent, runtimeMap);
  const avatarSize = "md"; // 统一中尺寸头像

  // R51-E1: HR 岗位分类(从 raw.category 读取,HR 卡显示)
  const category = React.useMemo(
    () => categoryPreset((agent.raw as Record<string, unknown> | null)?.category),
    [agent.raw],
  );

  // R51-E1: 通道入口(实例卡显示):来自 agent.channelIds,展示数量 + 类型(简化展示)
  const channelInfo = React.useMemo(() => {
    const ids = Array.isArray(agent.channelIds) ? agent.channelIds : [];
    return { count: ids.length };
  }, [agent.channelIds]);

  // R51-E1: 模型 + CTX 展示
  // 优先 defaultModel/defaultContextWindow(用户配置),回退到 model/contextWindow(provider_configs)
  const modelLabel = React.useMemo(() => {
    const m = (agent.defaultModel && agent.defaultModel.trim()) || (agent.model && agent.model.trim()) || "—";
    // 截短 model id,只保留主要部分(如 claude-sonnet-4-6 → sonnet-4.6)
    return m.replace(/^claude-/, "").replace(/^(gpt-|gemini-|deepseek-)/, "$1");
  }, [agent.defaultModel, agent.model]);
  const ctxLabel = React.useMemo(() => {
    const c = agent.defaultContextWindow ?? agent.contextWindow ?? 0;
    if (!c) return "—";
    if (c >= 1000) return `${Math.round(c / 1000)}K`;
    return String(c);
  }, [agent.defaultContextWindow, agent.contextWindow]);

  // R53-A1: 人格精简 — 改用统一 truncate helper(60 字 + ...)
  const personaShort = React.useMemo(
    () => truncate((agent.persona || agent.description || "").trim(), 60),
    [agent.persona, agent.description],
  );

  const onAction = async (e: React.MouseEvent, action: "pause" | "activate" | "deprecate" | "promoteToTemplate" | "toInstance" | "copyAsTemplate" | "generateInstance" | "delete") => {
    e.preventDefault();
    e.stopPropagation();
    if (action === "delete") {
      setDeleteOpen(true);
      return;
    }
    setActing(true);
    try {
      if (action === "pause") {
        await updateAgent(agent.id, { status: "paused", is_active: false });
      } else if (action === "activate") {
        await updateAgent(agent.id, { status: "active", is_active: true });
      } else if (action === "deprecate") {
        await updateAgent(agent.id, { status: "deprecated", is_active: false });
      } else if (action === "generateInstance") {
        // R42-FRONTEND: 实例生成走 /api/v2/admin/agent-templates/:id/instantiate
        const created = await createInstanceFromTemplate({
          templateId: agent.id,
          name: `${agent.displayName || agent.name} - 副本`,
          ownerId: null,
        });
        router.push(`/employees/${created.id}`);
      } else if (action === "promoteToTemplate") {
        // R44-1: 实例 → HR。弹 dialog 让用户填新 HR 名,确认后调 promoteInstanceToTemplate
        setPromoteName(`${agent.displayName || agent.name}-HR`);
        setPromoteOpen(true);
        setActing(false);
        return;
      } else if (action === "toInstance") {
        // R45-2: HR → 实例。弹 dialog 让用户填新实例名,确认后调 demoteTemplateToInstance
        if (!agent.isTemplate) {
          // 非 HR 不应触发,defensive fallback
          if (typeof window !== "undefined") {
            window.alert("转为实例 仅对 HR 卡可用。");
          }
          setActing(false);
          return;
        }
        setDemoteName(`${agent.displayName || agent.name}-实例`);
        setDemoteOpen(true);
        setActing(false);
        return;
      } else {
        // R42-ROUTES 已删除 copy-as-template 端点 — R45-3 待做,保留 stub
        const msg = {
          copyAsTemplate:
            "复制为 HR 已在 R42 删除。请直接新建 HR,把要复制的字段粘过去。",
        }[action as "copyAsTemplate"];
        if (typeof window !== "undefined" && msg) {
          window.alert(msg);
        }
        return;
      }
      onChanged?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (typeof window !== "undefined") {
        window.alert(`操作失败: ${message}`);
      }
    } finally {
      setActing(false);
    }
  };

  const onConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAgent({ id: agent.id, isTemplate: agent.isTemplate });
      toast.success(`已删除「${agent.displayName || agent.name}」`);
      setDeleteOpen(false);
      onChanged?.();
      // 当前页若是详情页(URL 带 id),删除后跳回列表
      if (typeof window !== "undefined" && window.location.pathname.includes(`/employees/${agent.id}`)) {
        router.push("/employees");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`删除失败: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  const CategoryIcon = category.Icon;

  // R53-A1: 部门色描边(实例 / HR)
  // HR 卡用 raw.category;实例卡 raw.category 缺失(v1 兜底 通用灰)
  const rawCategory = (agent.raw as Record<string, unknown> | null)?.category;
  const deptColor = getDepartmentColor(rawCategory);

  return (
    <Link
      ref={ref}
      href={`/employees/${agent.id}`}
      onMouseEnter={() => setHover(true)}
      onMouseMove={onMove}
      onMouseLeave={() => { setHover(false); setPos({ x: 50, y: 50 }); }}
      style={{
        borderColor: deptColor,
        boxShadow: `0 4px 16px -8px ${deptColor}33, 0 1px 3px -1px rgba(0,0,0,0.06)`,
      }}
      className={cn(
        // R53-A1: 名片样式 — rounded-2xl (16px) + 2px 部门色描边 + 细阴影
        "group relative block h-full w-full overflow-hidden rounded-2xl bg-card border-2 transition-all duration-300",
        "hover:shadow-md hover:-translate-y-0.5",
      )}
      data-testid={`agent-card-${agent.id.slice(0, 8)}`}
    >
      {/* R53-A1: 名片样式 — 移除原 hue gradient bg,改用极轻 hover 提示 */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-300",
          hover ? "opacity-100" : "opacity-0",
        )}
        style={{
          background: `radial-gradient(160px circle at ${pos.x}% ${pos.y}%, ${deptColor}14, transparent 70%)`,
        }}
      />

      {showManageActions && (
        <div className="absolute right-3 bottom-3 z-10" onClick={(e) => e.preventDefault()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="inline-flex items-center gap-1 rounded-lg bg-background/80 px-2 py-1 text-[11px] text-foreground/70 ring-1 ring-border backdrop-blur-sm hover:bg-background hover:text-foreground disabled:opacity-50"
              disabled={acting}
              data-testid={`agent-card-menu-${agent.id.slice(0, 8)}`}
            >
              {acting ? <Loader2 className="size-3 animate-spin" /> : <MoreVertical className="size-3" />}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {agent.status === "active" && (
                <DropdownMenuItem onClick={(e) => onAction(e, "pause")} data-testid="menu-pause">
                  <Pause className="size-4" /> 停用
                </DropdownMenuItem>
              )}
              {(agent.status === "paused" || agent.status === "deprecated") && (
                <DropdownMenuItem onClick={(e) => onAction(e, "activate")} data-testid="menu-activate">
                  <Play className="size-4" /> 启用
                </DropdownMenuItem>
              )}
              {agent.status !== "deprecated" && (
                <DropdownMenuItem onClick={(e) => onAction(e, "deprecate")}>
                  <Archive className="size-4" /> 标记弃用
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              {!isTemplateTab && agent.templateSource && (
                <div className="px-2 py-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/40">
                  派生自 {agent.templateSource.slice(0, 8)}…
                </div>
              )}
              {/* R42-FRONTEND: R42 主路径保留 '生成实例'。
                  R44-1: 实例 → HR 端点已恢复,加 '提升为 HR' 菜单项(只对非 HR instance 显示)。
                  R44-2/3/4(复制为 HR / 转为实例)未做,继续走 stub。
              */}
              {!agent.isTemplate && (
                <DropdownMenuItem
                  onClick={(e) => onAction(e, "promoteToTemplate")}
                  data-testid="menu-promote-to-template"
                >
                  <FileUp className="size-4" /> 提升为 HR
                </DropdownMenuItem>
              )}
              {agent.isTemplate && (
                <DropdownMenuItem
                  onClick={(e) => onAction(e, "generateInstance")}
                  data-testid="menu-generate-instance"
                >
                  <Sparkles className="size-4" /> 生成实例
                </DropdownMenuItem>
              )}
              {agent.isTemplate && (
                <DropdownMenuItem
                  onClick={(e) => onAction(e, "toInstance")}
                  data-testid="menu-to-instance"
                >
                  <ArrowDownToLine className="size-4" /> 转为实例
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => onAction(e, "delete")}
                className="text-rose-600 focus:text-rose-700 dark:text-rose-400 dark:focus:text-rose-300"
                data-testid="menu-delete"
              >
                <Trash2 className="size-4" /> 删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* R25: 状态 accent 顶线(参照 person-card) — 暂停/弃用时显示 */}
      <div
        aria-hidden
        className={cn(
          "absolute left-0 top-0 h-0.5 w-full z-[5] transition-opacity",
          agent.status === "active" && !runtimeMap[agent.id] ? "opacity-0" : "opacity-100",
          t.accent,
        )}
      />
      {/* R28-A: 实例卡片蓝色左 accent 线(一眼区分实例 vs HR) */}
      {!agent.isTemplate && (
        <div
          aria-hidden
          className="absolute left-0 top-0 h-full w-1.5 bg-blue-500/80 z-[5]"
        />
      )}
      {/* R53-A1: HR 卡片右下水印(名片样式 → 极轻提示) */}
      {agent.isTemplate && (
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-2 right-4 select-none text-5xl font-black leading-none tracking-tighter opacity-[0.04]"
          style={{ color: deptColor }}
        >
          HR
        </div>
      )}
      <div className="relative flex h-full w-full flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <AvatarMark glyph={agent.glyph} hue={agent.hue} size={avatarSize} />
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* R51-E1: 运行时状态 chip — 待命 / 工作 / 暂停 / 弃用 */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-[0.18em]",
                t.chip,
              )}
              data-testid={`runtime-status-${agent.id.slice(0, 8)}`}
            >
              <span className={cn("size-1.5 rounded-full", t.dot)} />
              {t.label}
            </span>
            {agent.isTemplate ? (
              <span className="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.18em] text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/30">
                <FileText className="size-2.5" />
                HR
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.18em] text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/30">
                <Bot className="size-2.5" />
                实例
              </span>
            )}
            {/* R53-T7.2: 实例卡显示"岗位"mini 标签(从 source HR 读名)— 仅实例 + 有源 HR 时显示 */}
            {!agent.isTemplate && agent.templateSource && hrNameMap?.[agent.templateSource] && (
              <Link
                href={`/employees/hr/${agent.templateSource}`}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex max-w-[140px] items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.18em] text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20"
                data-testid={`instance-hr-badge-${agent.id.slice(0, 8)}`}
              >
                <Briefcase className="size-2.5 shrink-0" />
                <span className="truncate">{hrNameMap[agent.templateSource]}</span>
              </Link>
            )}
            {/* R51-E1: HR 岗位分类 chip(画 / 文 / 运 / 其它)— 仅 HR 显示 */}
            {agent.isTemplate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.18em] ring-1",
                  category.tone,
                )}
                data-testid={`template-category-${agent.id.slice(0, 8)}`}
              >
                <CategoryIcon className="size-2.5" />
                {category.label}
              </span>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-2.5">
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold tracking-tight leading-tight text-xl">
                {agent.displayName || agent.name}
              </h3>
              <span className="text-xs font-mono text-foreground/40">v{agent.version}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-foreground/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-foreground/75 ring-1 ring-inset ring-foreground/10">
                {roleLabel}
              </span>
              <span className="text-[10.5px] font-mono text-foreground/45">{agent.complexity}</span>
            </div>
          </div>

          {/* R53-A1: 人格精简 — icon + 短描述(统一 60 字) */}
          {personaShort && (
            <div className="flex items-start gap-1.5" data-testid={`persona-short-${agent.id.slice(0, 8)}`}>
              <Brain className="size-3 shrink-0 mt-0.5 text-foreground/40" />
              <p
                className="text-foreground/75 leading-snug text-[12.5px] line-clamp-2"
                title={agent.persona || agent.description}
              >
                {personaShort}
              </p>
            </div>
          )}

          {/* R51-E1: 模型同步 + CTX(替代原硬编码的 model/ctx 显示,使用 defaultModel/defaultContextWindow) */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-foreground/55 font-mono">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ring-1",
                agent.isTemplate
                  ? "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/25"
                  : "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/25",
              )}
              data-testid={`model-chip-${agent.id.slice(0, 8)}`}
              title={`defaultModel: ${agent.defaultModel || agent.model}`}
            >
              <Brain className="size-2.5" />
              {modelLabel}
            </span>
            <span
              className="inline-flex items-center gap-1 text-foreground/55"
              data-testid={`ctx-chip-${agent.id.slice(0, 8)}`}
              title={`defaultContextWindow: ${agent.defaultContextWindow ?? agent.contextWindow}`}
            >
              <Hash className="size-2.5" />
              {ctxLabel} ctx
            </span>
            {/* R51-E1: 绑定入口数 + 频道类型(实例卡显示) */}
            {!agent.isTemplate && (
              <>
                <span className="text-foreground/30">·</span>
                <span
                  className="inline-flex items-center gap-1"
                  data-testid={`bind-count-${agent.id.slice(0, 8)}`}
                  title={channelInfo.count === 0 ? "尚未绑定入口" : `${channelInfo.count} 个入口`}
                >
                  <Radio className="size-2.5" />
                  {channelInfo.count} 入口
                </span>
              </>
            )}
          </div>

          {/* R55-D 4.3: 删 "主理人" 字段(归属者元数据冗余,实例归属见 /employees/[id] 详情)。
              保留 "执行中" 指示灯,仅当 agent 正在运行时显示。 */}
          {runtimeMap[agent.id] && (
            <div className="flex items-center justify-end gap-1 border-t border-foreground/[0.06] pt-2.5 text-[11px] font-mono text-emerald-600 dark:text-emerald-400" title="当前正在执行任务" data-testid={`running-indicator-${agent.id.slice(0, 8)}`}>
              <Activity className="size-3 animate-pulse" />
              <span>执行中</span>
            </div>
          )}
        </div>
      </div>

      {/* R44-1: 提升为 HR dialog */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提升为 HR 岗位</DialogTitle>
            <DialogDescription>
              将基于「{agent.displayName || agent.name}」创建一个新 HR 岗位。
              原实例保留,但会解绑该实例关联的所有 bot。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-[12px] text-foreground/70">新 HR 名</label>
            <Input
              value={promoteName}
              onChange={(e) => setPromoteName(e.target.value)}
              placeholder="新 HR 名"
              data-testid="promote-name-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromoteOpen(false)} disabled={promoting}>
              取消
            </Button>
            <Button
              onClick={async () => {
                const trimmed = promoteName.trim();
                if (!trimmed) {
                  toast.error("HR 名不能为空");
                  return;
                }
                setPromoting(true);
                try {
                  const result = await promoteInstanceToTemplate(agent.id, trimmed);
                  toast.success(`已创建 HR 岗位「${result.name}」`);
                  setPromoteOpen(false);
                  onChanged?.();
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  toast.error(`提升为 HR 失败: ${msg}`);
                } finally {
                  setPromoting(false);
                }
              }}
              disabled={promoting}
              data-testid="promote-confirm"
            >
              {promoting ? "处理中..." : "确认提升"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* R45-2: 转为实例 dialog */}
      <Dialog open={demoteOpen} onOpenChange={setDemoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>转为实例</DialogTitle>
            <DialogDescription>
              将基于「{agent.displayName || agent.name}」创建一个新实例。
              原 HR 保留,实例默认状态 active。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-[12px] text-foreground/70">新实例名</label>
            <Input
              value={demoteName}
              onChange={(e) => setDemoteName(e.target.value)}
              placeholder="新实例名"
              data-testid="demote-name-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDemoteOpen(false)} disabled={demoting}>
              取消
            </Button>
            <Button
              onClick={async () => {
                const trimmed = demoteName.trim();
                if (!trimmed) {
                  toast.error("实例名不能为空");
                  return;
                }
                setDemoting(true);
                try {
                  const result = await demoteTemplateToInstance(agent.id, trimmed);
                  toast.success(`已创建实例「${result.name}」`);
                  setDemoteOpen(false);
                  onChanged?.();
                } catch (err: unknown) {
                  const msg = err instanceof Error ? err.message : String(err);
                  toast.error(`转为实例失败: ${msg}`);
                } finally {
                  setDemoting(false);
                }
              }}
              disabled={demoting}
              data-testid="demote-confirm"
            >
              {demoting ? "处理中..." : "确认转实例"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* R51-E2: 删除二次确认 dialog */}
      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除 {agent.displayName || agent.name}?</DialogTitle>
            <DialogDescription>
              该操作不可撤销,所有绑定的入口/资源将自动释放。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
            {agent.isTemplate
              ? "该 HR 岗位被删除后,所有从该岗位生成的实例仍保留(它们已独立)。"
              : "该实例被删除后,所有绑定的 bot / 频道 / 知识库引用 / 运行日志将一并清理。"}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDelete}
              disabled={deleting}
              data-testid="delete-confirm"
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Link>
  );
}

function hueBg(hue: string): string {
  switch (hue) {
    case "amber":
      return "from-amber-200/55 via-amber-100/40 to-transparent dark:from-amber-900/40 dark:via-amber-900/10";
    case "rose":
      return "from-rose-200/55 via-rose-100/40 to-transparent dark:from-rose-900/40 dark:via-rose-900/10";
    case "teal":
      return "from-teal-200/55 via-teal-100/40 to-transparent dark:from-teal-900/40 dark:via-teal-900/10";
    case "stone":
      return "from-stone-300/55 via-stone-100/40 to-transparent dark:from-stone-800/40 dark:via-stone-800/10";
    case "indigo":
      return "from-indigo-300/55 via-indigo-100/40 to-transparent dark:from-indigo-900/40 dark:via-indigo-900/10";
    case "lime":
      return "from-lime-300/55 via-lime-100/40 to-transparent dark:from-lime-900/40 dark:via-lime-900/10";
    case "violet":
      return "from-violet-300/55 via-violet-100/40 to-transparent dark:from-violet-900/40 dark:via-violet-900/10";
    case "zinc":
    default:
      return "from-zinc-300/55 via-zinc-100/30 to-transparent dark:from-zinc-800/40 dark:via-zinc-800/10";
  }
}
