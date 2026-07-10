"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TEMPLATE_PRESETS, useTemplates, useAgents, createInstanceFromTemplate, copyAsTemplate,
  type Agent,
} from "../../_lib/data";
import { AvatarMark } from "../../_components/avatar-mark";
import { ArrowUpRight, Plus, Lock, Globe2, ArrowRight, X, Loader2, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";

interface Person { id: string; name: string; email: string; }

export function TemplatesBoard() {
  const [tab, setTab] = React.useState<"mine" | "public">("mine");
  const [mounted, setMounted] = React.useState(false);
  const { templates: rawTemplates, loading } = useTemplates();
  const [modalTpl, setModalTpl] = React.useState<Agent | null>(null);
  const [copyTpl, setCopyTpl] = React.useState<Agent | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // ⑦ 模板列表只显示 is_template=true 的空白模板,实例(is_template=false)不在此列
  const templates = rawTemplates.filter((t) => t.isTemplate);
  const totalMine = templates.length;
  const totalPublic = TEMPLATE_PRESETS.length;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-7">
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
            <span className="inline-block size-1.5 rounded-full bg-foreground/40" />
            模板库
          </div>
          <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02] max-w-[14ch]">
            从模板起手,或自己造一个
          </h1>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground/65">
            模板是数字员工的复制基底。同一个销售模板可以派生 5 个独立数字员工,配给不同员工,起不同名字。
            <strong className="text-foreground/80"> 复制 = 深拷贝</strong>:人格、系统提示词、技能、铁律全部独立。
          </p>
        </div>
        <Link
          href="/employees/new"
          className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-[13px] font-medium text-background hover:opacity-90"
        >
          <Plus className="size-4" /> 从空白起新模板
        </Link>
      </header>

      <div className="flex items-center gap-1 self-start">
        {[
          { id: "mine", label: "我自己的模板", count: totalMine, icon: <Lock className="size-3.5" /> },
          { id: "public", label: "公开模板", count: totalPublic, icon: <Globe2 className="size-3.5" /> },
        ].map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id as "mine" | "public")}
              className={
                "inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium ring-1 transition-all " +
                (on ? "bg-foreground text-background ring-foreground" : "bg-card text-foreground/65 ring-border hover:ring-foreground/40")
              }
            >
              {t.icon}
              {t.label}
              <span className="font-mono text-[11px] opacity-60">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "mine" ? (
        <MineGrid mounted={mounted} templates={templates} loading={loading} onInstantiate={(tpl) => setModalTpl(tpl)} onCopy={(tpl) => setCopyTpl(tpl)} />
      ) : (
        <PublicGrid mounted={mounted} />
      )}

      {modalTpl && (
        <FromTemplateModal template={modalTpl} onClose={() => setModalTpl(null)} />
      )}

      {copyTpl && (
        <CopyAsTemplateModal template={copyTpl} onClose={() => setCopyTpl(null)} onDone={() => setCopyTpl(null)} />
      )}
    </div>
  );
}

function MineGrid({
  mounted, templates, loading, onInstantiate, onCopy,
}: {
  mounted: boolean;
  templates: Agent[];
  loading: boolean;
  onInstantiate: (tpl: Agent) => void;
  onCopy: (tpl: Agent) => void;
}) {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 rounded-3xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    );
  }
  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border py-16 text-center">
        <Lock className="size-5 text-foreground/40" />
        <p className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          暂无自定义模板
        </p>
        <p className="text-[13px] text-foreground/55 max-w-[36ch]">
          模板可以从零新建,或在数字员工画廊把已有 agent "转为模板"。
        </p>
        <Link
          href="/employees/new"
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[12.5px] font-medium text-background"
        >
          <Plus className="size-3.5" /> 从空白起
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {templates.map((a, i) => (
        <div
          key={a.id}
          className={
            "transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
          }
          style={{ transitionDelay: mounted ? `${i * 60}ms` : "0ms" }}
        >
          <TemplateCard
            tpl={a}
            onInstantiate={() => onInstantiate(a)}
            onCopy={() => onCopy(a)}
          />
        </div>
      ))}
    </div>
  );
}

function TemplateCard({ tpl, onInstantiate, onCopy }: { tpl: Agent; onInstantiate: () => void; onCopy: () => void }) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-6 ring-1 ring-border transition-shadow hover:shadow-[0_24px_60px_-30px_rgba(0,0,0,0.18)]">
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-12 -right-10 size-44 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${hueToGrad(tpl.hue)}`}
      />
      <div className="relative flex items-start justify-between">
        <AvatarMark glyph={tpl.glyph} hue={tpl.hue} size="md" />
        <span className="rounded bg-foreground/10 px-2 py-0.5 text-[9.5px] font-mono uppercase tracking-[0.22em] text-foreground/65">
          TPL
        </span>
      </div>
      <div className="relative mt-6 flex flex-col gap-2">
        <Link href={`/employees/${tpl.id}`} className="group/link">
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-semibold tracking-tight hover:underline">{tpl.displayName || tpl.name}</h3>
            <span className="font-mono text-[11px] text-foreground/40">v{tpl.version}</span>
          </div>
        </Link>
        <p className="line-clamp-3 text-[13.5px] leading-relaxed text-foreground/75">
          {tpl.persona || tpl.description || <span className="text-foreground/40">暂无描述</span>}
        </p>
      </div>

      {(tpl.ironLaws.length > 0 || tpl.tools.length > 0 || tpl.skills.length > 0) && (
        <div className="relative mt-4 flex flex-wrap gap-1.5 text-[11px] font-mono text-foreground/55">
          {tpl.ironLaws.length > 0 && (
            <span className="rounded bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:text-rose-300">
              {tpl.ironLaws.length} 铁律
            </span>
          )}
          {tpl.tools.length > 0 && (
            <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-sky-700 dark:text-sky-300">
              {tpl.tools.length} 工具
            </span>
          )}
          {tpl.skills.length > 0 && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              {tpl.skills.length} 技能
            </span>
          )}
        </div>
      )}

      <div className="relative mt-auto flex items-center justify-between gap-2 pt-6">
        <div className="text-[11px] font-mono text-foreground/45 truncate">
          <span>{tpl.role}</span>
          <span className="mx-1">·</span>
          <span>{tpl.model}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* R42-FRONTEND: 复制按钮已删(原 POST /api/v2/admin/agents/:id/copy-as-template 返回 404)。
              保留'创建实例'(R42 主路径: POST /api/v2/admin/agent-templates/:id/instantiate)。*/}
          <Button
            size="sm"
            onClick={onInstantiate}
            className="gap-1 text-[12px]"
            data-testid={`instantiate-${tpl.id.slice(0, 8)}`}
          >
            <Sparkles className="size-3.5" /> 创建实例 <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function PublicGrid({ mounted }: { mounted: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {TEMPLATE_PRESETS.map((t, i) => (
        <div
          key={t.id}
          className={
            "transition-all duration-500 ease-out " +
            (mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4")
          }
          style={{ transitionDelay: mounted ? `${i * 60}ms` : "0ms" }}
        >
          <Link
            href={`/employees/new?template=${t.id}`}
            className="group relative flex h-full flex-col overflow-hidden rounded-3xl bg-card p-5 ring-1 ring-border transition-all hover:ring-foreground/40"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute inset-0 opacity-70 bg-gradient-to-br ${hueToGrad(t.hue)}`}
            />
            <div className="relative flex items-start justify-between">
              <AvatarMark glyph={t.glyph} hue={t.hue} size="md" />
              <ArrowUpRight className="size-4 text-foreground/40 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </div>
            <div className="relative mt-5 flex flex-col gap-1.5">
              <h3 className="text-[16px] font-semibold tracking-tight">{t.title}</h3>
              <p className="line-clamp-2 text-[12px] leading-relaxed text-foreground/65">{t.persona}</p>
            </div>
            <div className="relative mt-5 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
              <span>{t.complexity}</span>
              <span>·</span>
              <span>{t.role}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  );
}

function FromTemplateModal({
  template,
  onClose,
}: {
  template: Agent;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(`${template.displayName || template.name} - 副本`);
  const [ownerId, setOwnerId] = React.useState<string>("");
  const [people, setPeople] = React.useState<Person[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    api<{ data?: { items?: Person[] } } | { items?: Person[] }>("/api/v2/people?limit=100")
      .then((res) => {
        if (!alive) return;
        const items = (res as any)?.data?.items ?? (res as any)?.items ?? [];
        setPeople(items);
        // 默认选第一个 admin/owner
        if (items.length > 0 && !ownerId) setOwnerId(items[0].id);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请填写新实例名字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createInstanceFromTemplate({
        templateId: template.id,
        name: name.trim(),
        ownerId: ownerId || null,
      });
      router.push(`/employees/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>从模板创建实例</DialogTitle>
          <DialogDescription>
            深拷贝 <strong className="text-foreground/80">{template.displayName || template.name}</strong> 的全部配置
            (人格、系统提示词、技能、铁律),分配新 id + 新所有者。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              新实例名字 · name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:墨言-销售1组"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              主理人 · 所有者
            </label>
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— 未指定 —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email.split("@")[0]})
                </option>
              ))}
            </select>
          </div>

          {error && (
            <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}

          <div className="rounded-md bg-muted/40 px-3 py-2.5 text-[11.5px] text-foreground/55">
            <div className="flex items-center justify-between">
              <span>模板源</span>
              <span className="font-mono">{template.id.slice(0, 8)}…</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>角色</span>
              <span className="font-mono">{template.role}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span>模型</span>
              <span className="font-mono">{template.model}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {submitting ? "创建中…" : "创建并跳到详情"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function CopyAsTemplateModal({
  template,
  onClose,
  onDone,
}: {
  template: Agent;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = React.useState(`${template.displayName || template.name} - 副本`);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("请填写新模板名字");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await copyAsTemplate(template.id, name.trim());
      onDone();
      // Refresh page so the new template shows up in the list
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>复制为新模板</DialogTitle>
          <DialogDescription>
            深拷贝 <strong className="text-foreground/80">{template.displayName || template.name}</strong> 的全部配置
            (人格、系统提示词、技能、铁律、KB、MCP 引用),分配新 id + is_template=true。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              新模板名字 · name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如:销售模板 v2"
              autoFocus
              data-testid="copy-template-name"
            />
            <p className="text-[11px] text-foreground/45">
              模板允许重名 — 不必担心覆盖现有模板。
            </p>
          </div>

          {error && (
            <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-1.5"
            data-testid="copy-template-submit"
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}
            {submitting ? "复制中…" : "复制"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function hueToGrad(hue: string): string {
  const m: Record<string, string> = {
    amber: "from-amber-300/55 via-amber-100/40 to-transparent",
    rose: "from-rose-300/55 via-rose-100/40 to-transparent",
    teal: "from-teal-300/55 via-teal-100/40 to-transparent",
    sky: "from-sky-300/55 via-sky-100/40 to-transparent",
    indigo: "from-indigo-300/55 via-indigo-100/40 to-transparent",
    stone: "from-stone-300/55 via-stone-100/40 to-transparent",
    emerald: "from-emerald-300/55 via-emerald-100/40 to-transparent",
    violet: "from-violet-300/55 via-violet-100/40 to-transparent",
    lime: "from-lime-300/55 via-lime-100/40 to-transparent",
  };
  return m[hue] ?? "from-muted/40 to-transparent";
}
