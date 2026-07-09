"use client";

/**
 * /tasks/templates — R32-B 模板管理完善。
 *
 * 两个 tab:
 *   1. 系统内置模板 — DAG_TEMPLATES(只读,不可编辑/删除)
 *   2. 团队自定义模板 — /api/v2/tasks/templates(is_template=true pipelines,可编辑/删除/复制)
 *
 * 操作:
 *   - 使用/创建任务 → POST /api/v2/tasks/from-template 或 POST /api/v2/admin/pipelines
 *   - 编辑 → /tasks/[id]/edit (团队模板本身是 pipeline)
 *   - 删除 → DELETE /api/v2/admin/pipelines/:id
 *   - 复制为模板 → POST /api/v2/tasks/templates { sourcePipelineId }
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Copy,
  Edit3,
  FileText,
  Info,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast/toast-provider";
import { DAG_TEMPLATES } from "@/components/tasks/templates";

interface UserTemplate {
  id: string;
  name?: string;
  description?: string;
  template_category?: string;
  created_at?: string;
}

type TemplateTab = "system" | "team";

export default function TemplatesPage() {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = React.useState<TemplateTab>("system");
  const [userTemplates, setUserTemplates] = React.useState<UserTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const [duplicating, setDuplicating] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const loadUserTemplates = React.useCallback(async () => {
    try {
      const r = (await api("/api/v2/tasks/templates")) as {
        data?: { templates?: UserTemplate[] };
      };
      setUserTemplates(r?.data?.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载模板失败");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadUserTemplates();
  }, [loadUserTemplates]);

  // 从系统模板创建任务
  const createFromSystem = React.useCallback(
    async (tplId: string) => {
      setCreating(tplId);
      setError(null);
      try {
        const tpl = DAG_TEMPLATES.find((t) => t.id === tplId);
        if (!tpl) throw new Error("模板不存在");
        const nodes = tpl.nodes.map((n, i) => ({
          id: `n${i}`,
          label: n.meta.label ?? n.meta.kind,
          agentTemplateId: n.meta.refId ?? "",
        }));
        const edges = tpl.edges.map((e, i) => ({
          id: `e${i}`,
          from: `n${e.from}`,
          to: `n${e.to}`,
        }));
        const r = (await api("/api/v2/admin/pipelines", {
          method: "POST",
          body: {
            name: `${tpl.name} · 任务`,
            description: tpl.description,
            nodes,
            edges,
            triggerType: "manual",
          },
        })) as { data?: { id?: string } };
        const newId = r?.data?.id;
        if (newId) router.push(`/tasks/${newId}/`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建失败");
      } finally {
        setCreating(null);
      }
    },
    [router],
  );

  // 从团队模板创建任务
  const createFromUser = React.useCallback(
    async (tplId: string, name: string) => {
      setCreating(tplId);
      setError(null);
      try {
        const r = (await api("/api/v2/tasks/from-template", {
          method: "POST",
          body: { templateId: tplId, name },
        })) as { data?: { id?: string } };
        const newId = r?.data?.id;
        if (newId) router.push(`/tasks/${newId}/`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "创建失败");
      } finally {
        setCreating(null);
      }
    },
    [router],
  );

  // 复制为模板 — POST /api/v2/tasks/templates
  const duplicateAsTemplate = React.useCallback(
    async (tplId: string, name: string) => {
      setDuplicating(tplId);
      setError(null);
      try {
        await api("/api/v2/tasks/templates", {
          method: "POST",
          body: { sourcePipelineId: tplId, name: `${name} · 副本`, category: "user" },
        });
        toast.success("已复制为新模板");
        await loadUserTemplates();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "复制失败";
        setError(msg);
        toast.error(msg);
      } finally {
        setDuplicating(null);
      }
    },
    [loadUserTemplates, toast],
  );

  // 删除团队模板 — DELETE /api/v2/admin/pipelines/:id
  const deleteTemplate = React.useCallback(
    async (tplId: string) => {
      setDeleting(tplId);
      setError(null);
      try {
        await api(`/api/v2/admin/pipelines/${tplId}`, { method: "DELETE" });
        toast.success("模板已删除");
        setConfirmDeleteId(null);
        await loadUserTemplates();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "删除失败";
        setError(msg);
        toast.error(msg);
        setConfirmDeleteId(null);
      } finally {
        setDeleting(null);
      }
    },
    [loadUserTemplates, toast],
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/tasks"
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          返回任务列表
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          任务模板
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          从内置最佳实践或团队保存的模板一键创建任务
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {/* Tab 切换 */}
      <div className="inline-flex items-center gap-1 rounded-full bg-muted/40 p-1 ring-1 ring-border">
        <TabButton
          active={tab === "system"}
          onClick={() => setTab("system")}
          icon={<Star className="size-3.5" />}
          label="系统内置"
          count={DAG_TEMPLATES.length}
        />
        <TabButton
          active={tab === "team"}
          onClick={() => setTab("team")}
          icon={<FileText className="size-3.5" />}
          label="团队自定义"
          count={userTemplates.length}
        />
      </div>

      {/* 系统内置模板 tab */}
      {tab === "system" && (
        <section className="space-y-3">
          <InfoBanner
            text="系统内置模板为每个数字员工预置的开箱即用最佳实践流程,只读不可编辑或删除。点击「使用」即可派生一个新任务。"
            tone="amber"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {DAG_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-xl ring-1 ring-foreground/10 bg-card hover:ring-foreground/30 transition-all p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-2">
                  <div className="grid place-items-center size-9 rounded-md bg-sky-50 text-sky-600 ring-1 ring-sky-200">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{tpl.name}</div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                      {tpl.botId}
                    </div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                    <Lock className="size-2.5" />
                    只读
                  </span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-2 leading-snug min-h-[32px]">
                  {tpl.description}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-mono pt-2 border-t border-foreground/5">
                  <span>{tpl.nodes.length} 节点</span>
                  <span>{tpl.edges.length} 边</span>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => createFromSystem(tpl.id)}
                    disabled={creating === tpl.id}
                    className="ml-auto h-7 px-2.5 text-xs"
                  >
                    {creating === tpl.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    使用
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 团队自定义模板 tab */}
      {tab === "team" && (
        <section className="space-y-3">
          <InfoBanner
            text="团队自定义模板 = 编排好的任务流程另存为团队公用模板,可对全团队开放使用。支持编辑、删除、复制,随时沉淀新的标准流程。"
            tone="primary"
          />
          {loading ? (
            <div className="grid place-items-center py-12 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin mr-2 inline-block" />
              加载模板…
            </div>
          ) : userTemplates.length === 0 ? (
            <div className="rounded-lg ring-1 ring-dashed ring-foreground/15 py-10 text-center text-xs text-muted-foreground space-y-2">
              <div>暂无自定义模板</div>
              <div>在任务详情页点击「另存为模板」即可沉淀团队流程为公用模板。</div>
              <Link href="/tasks">
                <Button size="sm" variant="outline" className="mt-2 gap-1.5">
                  <ArrowLeft className="size-3.5 rotate-180" />
                  去任务列表
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {userTemplates.map((t) => {
                const name = t.name ?? "未命名模板";
                const isConfirming = confirmDeleteId === t.id;
                return (
                  <div
                    key={t.id}
                    className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-start gap-2">
                      <div className="grid place-items-center size-9 rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
                        <FileText className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {formatDate(t.created_at)}
                        </div>
                      </div>
                      <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                        <CheckCircle2 className="size-2.5" />
                        团队
                      </span>
                    </div>
                    {t.description && (
                      <div className="text-[11px] text-muted-foreground line-clamp-2 leading-snug min-h-[28px]">
                        {t.description}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 pt-2 border-t border-foreground/5 mt-auto">
                      <Button
                        size="xs"
                        onClick={() => createFromUser(t.id, `${name} · 任务`)}
                        disabled={creating === t.id}
                        className="h-7 px-2.5 text-xs"
                      >
                        {creating === t.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        创建任务
                      </Button>
                      <Link href={`/tasks/${t.id}/edit`}>
                        <Button
                          size="xs"
                          variant="outline"
                          className="h-7 px-2 text-xs gap-1"
                          title="编辑模板"
                        >
                          <Edit3 className="size-3" />
                          编辑
                        </Button>
                      </Link>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => duplicateAsTemplate(t.id, name)}
                        disabled={duplicating === t.id}
                        className="h-7 px-2 text-xs gap-1"
                        title="复制为新模板"
                      >
                        {duplicating === t.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                        复制
                      </Button>
                      {isConfirming ? (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => deleteTemplate(t.id)}
                          disabled={deleting === t.id}
                          className="h-7 px-2 text-xs gap-1 ring-rose-400 text-rose-600 hover:bg-rose-50"
                          title="再次点击确认删除"
                        >
                          {deleting === t.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Trash2 className="size-3" />
                          )}
                          确认?
                        </Button>
                      ) : (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setConfirmDeleteId(t.id)}
                          className="h-7 px-2 text-xs gap-1 text-rose-600 hover:bg-rose-50 hover:ring-rose-300"
                          title="删除模板"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
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

function InfoBanner({ text, tone }: { text: string; tone: "amber" | "primary" }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11.5px] leading-relaxed",
        tone === "amber"
          ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 ring-1 ring-amber-500/20"
          : "bg-primary/5 text-foreground/70 ring-1 ring-primary/15",
      )}
    >
      <Info className={cn("size-3.5 mt-0.5 shrink-0", tone === "amber" ? "text-amber-500" : "text-primary")} />
      <span>{text}</span>
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("zh-CN");
  } catch {
    return iso;
  }
}
