"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAgent, updateAgent, createInstanceFromTemplate, copyAsTemplate, deleteAgent } from "../../_lib/data";
import { AvatarMark, statusTone } from "../../_components/avatar-mark";
import {
  ArrowLeft, User2, GitBranch, Hash,
  MoreVertical, Pause, Play, Archive, Copy, Loader2, Check, Sparkles, Trash2,
} from "lucide-react";
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
                  <Copy className="size-4" /> 复制为模板
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
            <DialogTitle>从模板生成实例</DialogTitle>
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
              ? "该模板被删除后,所有从该模板生成的实例仍保留(它们已独立)。"
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
