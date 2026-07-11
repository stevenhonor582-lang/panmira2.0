"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgent, updateAgent, createInstanceFromTemplate, copyAsTemplate, deleteAgent, promoteInstanceToTemplate } from "../../_lib/data";
import { AvatarMark, statusTone } from "../../_components/avatar-mark";
import {
  ArrowLeft, User2, GitBranch, Hash, Briefcase, ChevronRight,
  MoreVertical, Pause, Play, Archive, Copy, Loader2, Check, Sparkles, Trash2,
} from "lucide-react";
import { getDepartmentColor } from "@/lib/department-color";
import { truncate } from "@/lib/text-truncate";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function AgentHeader({ id }: { id: string }) {
  const router = useRouter();
  const { agent, loading, reload } = useAgent(id);
  const [acting, setActing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [instantiateOpen, setInstantiateOpen] = React.useState(false);
  const [instanceName, setInstanceName] = React.useState("");
  const [instantiating, setInstantiating] = React.useState(false);
  const [instantiateError, setInstantiateError] = React.useState<string | null>(null);
  // R51-E2: 删除二次确认 dialog
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // R52-FRONTEND: 提炼为数字HR dialog (实例 → 新岗位)
  const [extractOpen, setExtractOpen] = React.useState(false);
  const [extractName, setExtractName] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [extractError, setExtractError] = React.useState<string | null>(null);
  const toast = useToast();

  React.useEffect(() => {
    if (agent && !instanceName) {
      setInstanceName(`${agent.displayName || agent.name} - 副本`);
    }
  }, [agent?.id]);

  const handleInstantiate = async () => {
    if (!instanceName.trim() || !agent) return;
    setInstantiating(true);
    setInstantiateError(null);
    try {
      const created = await createInstanceFromTemplate({
        templateId: agent.id,
        name: instanceName.trim(),
        ownerId: null,
      });
      setInstantiateOpen(false);
      router.push(`/employees/${created.id}`);
    } catch (e: unknown) {
      setInstantiateError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstantiating(false);
    }
  };

  // R52-FRONTEND: 实例 → 提炼为数字 HR(创建新 HR,原实例不动)
  React.useEffect(() => {
    if (agent && !extractName) {
      setExtractName(`${agent.displayName || agent.name}-岗位`);
    }
  }, [agent?.id]);

  const handleExtractToHr = async () => {
    if (!agent) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const result = await promoteInstanceToTemplate(agent.id, extractName.trim() || undefined);
      toast.success(`已提炼为数字HR「${result.name}」`);
      setExtractOpen(false);
      router.push(`/employees/hr/${result.id}`);
    } catch (e: unknown) {
      setExtractError(e instanceof Error ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const handleCopyAsTemplate = async () => {
    if (!agent) return;
    setActing(true);
    try {
      await copyAsTemplate(agent.id);
      reload();
    } catch (e) {
      console.error("[agent-header] copyAsTemplate failed:", e);
    } finally {
      setActing(false);
    }
  };

  const onConfirmDelete = async () => {
    if (!agent) return;
    setDeleting(true);
    try {
      await deleteAgent({ id: agent.id, isTemplate: agent.isTemplate });
      toast.success(`已删除「${agent.displayName || agent.name}」`);
      setDeleteOpen(false);
      router.push("/employees");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`删除失败: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-12 text-center">
        <p className="text-[15px] text-foreground/65">这个 bot 不存在,或者已被删除。</p>
        <Link href="/employees" className="mt-3 inline-block text-sm text-foreground underline">回到员工库</Link>
      </div>
    );
  }
  const t = statusTone(agent.status);

  const onAction = async (action: "pause" | "activate" | "deprecate") => {
    setActing(true);
    try {
      const patch =
        action === "pause"
          ? { status: "paused", is_active: false }
          : action === "activate"
          ? { status: "active", is_active: true }
          : { status: "deprecated", is_active: false };
      await updateAgent(id, patch);
      reload();
    } catch (e) {
      console.error("[agent-header] action failed:", e);
    } finally {
      setActing(false);
    }
  };

  const copySID = async () => {
    try {
      await navigator.clipboard.writeText(agent.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // fallback — 选中文本
      const range = document.createRange();
      const node = document.getElementById("agent-sid-text");
      if (node) {
        range.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <header className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border">
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 -right-12 size-80 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${hueGradient(agent.hue)}`}
      />
      <div className="relative flex items-start justify-between">
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground"
        >
          <ArrowLeft className="size-3" /> 回到员工库
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-foreground/60 hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
            data-testid="agent-card-menu"
            disabled={acting}
          >
            {acting ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}
            <span>操作</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {agent.status === "active" && (
              <DropdownMenuItem onClick={() => onAction("pause")} data-testid="menu-pause">
                <Pause className="size-4" /> 停用
              </DropdownMenuItem>
            )}
            {(agent.status === "paused" || agent.status === "deprecated") && (
              <DropdownMenuItem onClick={() => onAction("activate")} data-testid="menu-activate">
                <Play className="size-4" /> 启用
              </DropdownMenuItem>
            )}
            {agent.status !== "deprecated" && (
              <DropdownMenuItem onClick={() => onAction("deprecate")} data-testid="menu-deprecate">
                <Archive className="size-4" /> 标记弃用
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copySID} data-testid="menu-copy-sid">
              {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              {copied ? "已复制 SID" : "复制 SID"}
            </DropdownMenuItem>
            {agent.isTemplate && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setInstantiateOpen(true)}
                  data-testid="menu-generate-instance"
                >
                  <Sparkles className="size-4" /> 生成实例
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleCopyAsTemplate}
                  data-testid="menu-copy-as-template"
                >
                  <Copy className="size-4" /> 复制为 HR
                </DropdownMenuItem>
              </>
            )}
            {/* R52-FRONTEND: 仅"在职"实例可以提炼为数字HR(创建新岗位,不动原实例) */}
            {!agent.isTemplate && agent.status === "active" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setExtractOpen(true)}
                  data-testid="menu-extract-to-hr"
                >
                  <Briefcase className="size-4" /> 提炼为数字HR
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-rose-600 focus:text-rose-700 dark:text-rose-400 dark:focus:text-rose-300"
              data-testid="menu-delete"
            >
              <Trash2 className="size-4" /> 删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative mt-6 flex flex-col gap-6 md:flex-row md:items-end">
        <AvatarMark glyph={agent.glyph} hue={agent.hue} size="xl" />
        <div className="flex-1">
          {/* R53-T7.4: 实例有源 HR 时,在 title 上方展示"所属岗位"卡 */}
          {!agent.isTemplate && agent.templateSource && (
            <div className="mb-4 max-w-[58ch]">
              <HrSourceCard sourceId={agent.templateSource} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
            <span className="inline-flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </span>
            <span>·</span>
            <span>{agent.role}</span>
            <span>·</span>
            <span>v{agent.version}</span>
            <span>·</span>
            <span className="text-foreground/45">{agent.complexityLevel}</span>
          </div>
          <h1 className="mt-2 text-5xl font-semibold tracking-tighter leading-[1.02]">
            {agent.displayName}
          </h1>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-foreground/75">
            {agent.persona || agent.description || <span className="text-foreground/40">暂无人格定义,点击编辑添加</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          {agent.isTemplate && (
            <Button
              size="sm"
              onClick={() => setInstantiateOpen(true)}
              className="gap-1.5"
              data-testid="generate-instance-primary"
            >
              <Sparkles className="size-3.5" /> 生成实例
            </Button>
          )}
          <Stat label="今日任务" value={agent.tasksToday} />
          <span className="text-[11.5px] font-mono text-foreground/45">
            主理 · {agent.ownerName}
          </span>
        </div>
      </div>

      <div className="relative mt-7 flex flex-wrap gap-5 border-t border-border pt-4 text-[12px] font-mono text-foreground/55">
        <span className="inline-flex items-center gap-1.5">
          <User2 className="size-3" /> {agent.ownerName}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="size-3" /> {agent.templateSource ? "派生" : "原创"}
        </span>
        <span id="agent-sid-text" className="inline-flex items-center gap-1.5" data-testid="agent-sid">
          <Hash className="size-3" /> {agent.id.slice(0, 8)}…
        </span>
        <span className="ml-auto text-foreground/35">
          created {new Date(agent.createdAt).toLocaleDateString("zh-CN")}
        </span>
      </div>

      <Dialog open={instantiateOpen} onOpenChange={(o) => { if (!o) setInstantiateOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>从 HR 岗位招新员工</DialogTitle>
            <DialogDescription>
              深拷贝 <strong className="text-foreground/80">{agent.displayName || agent.name}</strong> 的全部配置,
              分配新 id + is_template=false + 新 working_dir。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                新实例名字 · name
              </label>
              <Input
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="如:墨言-销售1组"
                autoFocus
                data-testid="instantiate-name"
              />
            </div>
            {instantiateError && (
              <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
                {instantiateError}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setInstantiateOpen(false)} disabled={instantiating}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleInstantiate}
              disabled={instantiating}
              className="gap-1.5"
              data-testid="instantiate-submit"
            >
              {instantiating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {instantiating ? "创建中…" : "创建并跳到详情"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* R52-FRONTEND: 提炼为数字HR dialog */}
      <Dialog open={extractOpen} onOpenChange={(o) => { if (!extracting) setExtractOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>提炼为数字HR</DialogTitle>
            <DialogDescription>
              将基于当前实例「<strong className="text-foreground/80">{agent.displayName || agent.name}</strong>」创建一个新的岗位。
              <strong> 原实例不会被修改</strong>,它继续独立运行 — 只是"祖辈"多了一个 HR 岗位可被其它新员工复用。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
                新岗位名字 · name
              </label>
              <Input
                value={extractName}
                onChange={(e) => setExtractName(e.target.value)}
                placeholder="如:销售岗位-A组"
                autoFocus
                data-testid="extract-hr-name"
              />
            </div>
            {extractError && (
              <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
                {extractError}
              </div>
            )}
            <div className="rounded-md bg-muted/40 px-3 py-2.5 text-[11.5px] text-foreground/55">
              提炼后,你可以在 <code className="rounded bg-foreground/5 px-1 py-0.5 text-[11px]">/hr</code> 库看到它,
              其它员工可以用这个岗位"招聘"出新实例。
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setExtractOpen(false)} disabled={extracting}>
              取消
            </Button>
            <Button
              size="sm"
              onClick={handleExtractToHr}
              disabled={extracting}
              className="gap-1.5"
              data-testid="extract-hr-submit"
            >
              {extracting ? <Loader2 className="size-3.5 animate-spin" /> : <Briefcase className="size-3.5" />}
              {extracting ? "提炼中…" : "提炼"}
            </Button>
          </div>
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirmDelete}
              disabled={deleting}
              data-testid="delete-confirm"
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-muted/30 px-4 py-2.5 ring-1 ring-border">
      <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">{label}</div>
      <div className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function hueGradient(hue: string) {
  const map: Record<string, string> = {
    amber: "from-amber-300 to-rose-200",
    rose: "from-rose-300 to-pink-200",
    teal: "from-teal-300 to-sky-200",
    stone: "from-stone-300 to-zinc-200",
    indigo: "from-indigo-300 to-violet-200",
    lime: "from-lime-300 to-emerald-200",
    violet: "from-violet-300 to-indigo-200",
    zinc: "from-zinc-300 to-stone-200",
    sky: "from-sky-300 to-blue-200",
    emerald: "from-emerald-300 to-teal-200",
  };
  return map[hue] ?? map.amber;
}


/**
 * R53-T7.4: 实例详情顶部"所属岗位"卡
 * 派生自哪个 HR(template_source),显示 HR 名 + 部门色描边。
 * - 用自己 useAgent 拿源 HR,符合 Rules of Hooks
 * - 加载/失败时 fallback 到骨架 / 静态文本
 */
function HrSourceCard({ sourceId }: { sourceId: string }) {
  const { agent: hr, loading } = useAgent(sourceId);
  // category 来自 raw.category(Agent 类型未直接暴露 category 字段)
  const hrCategory =
    typeof hr?.raw?.category === "string" ? (hr.raw.category as string) : "";
  const deptColor = getDepartmentColor(hrCategory);
  const deptLabel = hrCategory && hrCategory.length > 0 ? hrCategory : "通用";
  const summary = hr ? truncate(hr.persona || hr.description || hr.systemPrompt, 80) : "";
  return (
    <Link
      href={hr ? `/employees/hr/${hr.id}` : "#"}
      className="group relative block overflow-hidden rounded-2xl bg-card/60 p-4 ring-1 ring-border backdrop-blur-sm transition-all hover:ring-foreground/30 hover:shadow-sm"
      style={{ borderLeft: `4px solid ${deptColor}` }}
      data-testid="instance-source-hr-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
          <Briefcase className="size-3" style={{ color: deptColor }} />
          所属岗位
        </div>
        <ChevronRight className="size-3.5 text-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-foreground/55" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-semibold tracking-tight">
          {loading && !hr ? <span className="inline-block h-5 w-32 rounded bg-muted/40 animate-pulse" /> : (hr?.displayName || hr?.name || sourceId.slice(0, 8) + "…")}
        </h3>
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider"
          style={{
            color: deptColor,
            backgroundColor: `${deptColor}1a`,
          }}
        >
          {deptLabel}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-foreground/65">
        {summary || "岗位简介加载中…"}
      </p>
    </Link>
  );
}
