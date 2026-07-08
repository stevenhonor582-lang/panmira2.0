"use client";

/**
 * /tasks/templates — R13-D template gallery.
 *
 * Two sources:
 *   1. System templates — bundled DAG_TEMPLATES (P3.4's 5 bot defaults)
 *   2. User templates — fetched from /api/v2/tasks/templates (is_template=true pipelines)
 *
 * "Use this template" → POST /api/v2/tasks/from-template
 *   - System templates: synthesise a pipeline via POST /api/v2/admin/pipelines with derived nodes
 *   - User templates: POST /api/v2/tasks/from-template { templateId }
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DAG_TEMPLATES } from "@/components/tasks/templates";

interface UserTemplate {
  id: string;
  name?: string;
  description?: string;
  template_category?: string;
  created_at?: string;
}

export default function TemplatesPage() {
  const router = useRouter();
  const [userTemplates, setUserTemplates] = React.useState<UserTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [creating, setCreating] = React.useState<string | null>(null);
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

  // Create task from a system template
  const createFromSystem = React.useCallback(
    async (tplId: string) => {
      setCreating(tplId);
      setError(null);
      try {
        const tpl = DAG_TEMPLATES.find((t) => t.id === tplId);
        if (!tpl) throw new Error("模板不存在");
        // Synthesise a minimal pipeline body the backend's createPipeline accepts.
        // The backend's validatePipeline expects nodes with {id,label,agentTemplateId}.
        // Bot nodes → refId as agentTemplateId; others → fall back to refId or 'mock'.
        const nodes = tpl.nodes.map((n, i) => ({
          id: `n${i}`,
          label: n.meta.label ?? n.meta.kind,
          agentTemplateId: n.meta.refId ?? "mock",
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

  // Create from a user template (server-side copy)
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

      {/* System templates */}
      <section>
        <SectionHeader
          icon={<Star className="size-3.5 text-amber-500" />}
          title="系统模板"
          subtitle="每个数字员工一个开箱即用的最佳实践流程"
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

      {/* User templates */}
      <section>
        <SectionHeader
          icon={<FileText className="size-3.5 text-primary" />}
          title="团队自定义模板"
          subtitle="从「另存为模板」保存的现成任务流程"
        />
        {loading ? (
          <div className="grid place-items-center py-12 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin mr-2 inline-block" />
            加载模板…
          </div>
        ) : userTemplates.length === 0 ? (
          <div className="rounded-lg ring-1 ring-dashed ring-foreground/15 py-10 text-center text-xs text-muted-foreground">
            暂无自定义模板 · 在任务详情页点击「另存为模板」即可沉淀团队流程
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {userTemplates.map((t) => (
              <div
                key={t.id}
                className="rounded-xl ring-1 ring-foreground/10 bg-card p-4 flex flex-col gap-2"
              >
                <div className="text-sm font-medium truncate">{t.name ?? "未命名模板"}</div>
                {t.description && (
                  <div className="text-[11px] text-muted-foreground line-clamp-2 leading-snug min-h-[28px]">
                    {t.description}
                  </div>
                )}
                <div className="text-[10px] text-muted-foreground font-mono">
                  {formatDate(t.created_at)}
                </div>
                <div className="flex items-center gap-2 pt-2 border-t border-foreground/5 mt-auto">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => createFromUser(t.id, `${t.name ?? "任务"} · 副本`)}
                    disabled={creating === t.id}
                    className="h-7 px-2.5 text-xs"
                  >
                    {creating === t.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    从此创建
                  </Button>
                  <span className="ml-auto inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                    <CheckCircle2 className="size-2.5" />
                    {t.template_category === "user" ? "团队" : "系统"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3">
      <div className="text-sm font-semibold flex items-center gap-1.5">{icon}{title}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
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
