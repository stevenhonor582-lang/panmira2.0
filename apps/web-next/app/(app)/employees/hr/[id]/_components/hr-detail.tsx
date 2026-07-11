"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, Edit, Trash2, Loader2, Box, Brush, PenLine, Wrench, BookOpen, Layers, User2, Hash,
} from "lucide-react";
import {
  useAgent, updateAgent, deleteAgent, fetchAgents, type Agent,
} from "../../../_lib/data";
import { AvatarMark, statusTone } from "../../../_components/avatar-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

const CATEGORY_LABEL: Record<string, { label: string; Icon: typeof Brush; tone: string }> = {
  art:        { label: "绘画", Icon: Brush,    tone: "bg-rose-500/10  text-rose-700  dark:text-rose-300  ring-rose-500/25" },
  copy:       { label: "文案", Icon: PenLine,  tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/25" },
  ops:        { label: "运维", Icon: Wrench,   tone: "bg-teal-500/10  text-teal-700  dark:text-teal-300  ring-teal-500/25" },
  general:    { label: "通用", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
  custom:     { label: "其它", Icon: Layers,   tone: "bg-zinc-500/10  text-zinc-700  dark:text-zinc-300  ring-zinc-500/30" },
};

const HUE_GRAD: Record<string, string> = {
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

const TEMPLATE_TYPE_LABEL: Record<string, string> = {
  system: "系统预设",
  custom: "用户自定义",
  builtin: "内置",
};

export function HrDetail({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const { agent, loading, reload, setAgent } = useAgent(id);
  const [usageCount, setUsageCount] = React.useState<number>(0);
  const [usageInstances, setUsageInstances] = React.useState<Agent[]>([]);

  const [editing, setEditing] = React.useState(false);
  const [editName, setEditName] = React.useState("");
  // R55-B 2.4: 快速改名 — 只改 name 字段, 不进整体编辑
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [editPersona, setEditPersona] = React.useState("");
  const [editSystemPrompt, setEditSystemPrompt] = React.useState("");
  const [editIronLawsText, setEditIronLawsText] = React.useState("");
  const [editCategory, setEditCategory] = React.useState("general");
  const [editTemplateType, setEditTemplateType] = React.useState("custom");
  const [editHue, setEditHue] = React.useState("amber");
  const [editGlyph, setEditGlyph] = React.useState("新");
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  // R53-A3: role_template 单独可编辑
  const [roleEditOpen, setRoleEditOpen] = React.useState(false);
  const [roleEditValue, setRoleEditValue] = React.useState("");
  const [roleEditBusy, setRoleEditBusy] = React.useState(false);
  const [roleEditError, setRoleEditError] = React.useState<string | null>(null);
  const [roleEditedAt, setRoleEditedAt] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    if (!agent) return;
    Promise.all([
      fetchAgents({ filter: "instance" }),
    ]).then(([instances]) => {
      if (!alive) return;
      const used = instances.filter((i) => i.templateSource === agent.id);
      setUsageInstances(used);
      setUsageCount(used.length);
    }).catch(() => {});
    return () => { alive = false; };
  }, [agent?.id]);

  React.useEffect(() => {
    if (!agent || !editing) return;
    setEditName(agent.displayName || agent.name);
    setEditPersona(agent.persona || "");
    setEditSystemPrompt(agent.systemPrompt || "");
    setEditIronLawsText((agent.ironLaws ?? []).join("\n"));
    const raw = (agent.raw ?? {}) as Record<string, unknown>;
    setEditCategory(typeof raw.category === "string" ? raw.category : "general");
    setEditTemplateType(typeof raw.template_type === "string" ? raw.template_type : "custom");
    setEditHue(agent.hue);
    setEditGlyph(agent.glyph);
  }, [editing, agent?.id]);

  if (loading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }
  if (!agent) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-12 text-center">
        <p className="text-[15px] text-foreground/65">这个岗位不存在,或者已被删除。</p>
        <Link href="/employees/hr" className="mt-3 inline-block text-sm text-foreground underline">回到 HR 库</Link>
      </div>
    );
  }

  const raw = (agent.raw ?? {}) as Record<string, unknown>;
  const categoryKey = typeof raw.category === "string" ? raw.category : "general";
  const templateTypeKey = typeof raw.template_type === "string" ? raw.template_type : "custom";
  const cat = CATEGORY_LABEL[categoryKey] ?? CATEGORY_LABEL.general;
  const t = statusTone(agent.status);

  // R55-B 2.4: 快速改名 — 只 PATCH name 字段
  const onConfirmRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === (agent.displayName || agent.name)) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    try {
      const updated = await updateAgent(agent.id, { name: trimmed });
      if (updated) {
        setAgent(updated);
        toast.success("岗位名已更新");
        setRenameOpen(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`改名失败: ${msg}`);
    } finally {
      setRenaming(false);
    }
  };

  const onSaveEdit = async () => {
    setSaving(true);
    try {
      const ironLaws = editIronLawsText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const updated = await updateAgent(agent.id, {
        name: editName.trim() || agent.name,
        persona: editPersona,
        system_prompt: editSystemPrompt,
        iron_laws: ironLaws,
        category: editCategory,
        template_type: editTemplateType,
        avatar_hue: editHue,
        avatar_glyph: editGlyph,
      });
      if (updated) {
        setAgent(updated);
        toast.success("岗位已更新");
        setEditing(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`更新失败: ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const onConfirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteAgent({ id: agent.id, isTemplate: true });
      toast.success(`已删除岗位「${agent.displayName || agent.name}」`);
      setDeleteOpen(false);
      router.push("/hr");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`删除失败: ${msg}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-7">
      <Link
        href="/employees/hr"
        className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-foreground/45 hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> HR 库
      </Link>

      <header className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border">
        <div
          aria-hidden
          className={`pointer-events-none absolute -top-20 -right-12 size-80 rounded-full blur-3xl opacity-40 bg-gradient-to-br ${HUE_GRAD[agent.hue] ?? HUE_GRAD.amber}`}
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end">
          <AvatarMark glyph={agent.glyph} hue={agent.hue} size="xl" />
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ring-1", cat.tone)}>
                <cat.Icon className="size-2.5" />
                {cat.label}
              </span>
              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5", t.chip)}>
                <span className={cn("size-1.5 rounded-full", t.dot)} />
                {t.label}
              </span>
              <span>·</span>
              <span>{TEMPLATE_TYPE_LABEL[templateTypeKey] ?? templateTypeKey}</span>
              <span>·</span>
              <span>{agent.role}</span>
              <span>·</span>
              <span>v{agent.version}</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <h1 className="text-5xl font-semibold tracking-tighter leading-[1.02]">
                {agent.displayName || agent.name}
              </h1>
              {/* R55-B 2.4: 快速改名按钮 — Pen 图标, 不打开整体编辑 */}
              <button
                type="button"
                onClick={() => {
                  setRenameValue(agent.displayName || agent.name);
                  setRenameOpen(true);
                }}
                aria-label="快速改名"
                title="修改岗位名称"
                className="inline-flex size-8 items-center justify-center rounded-full text-foreground/40 hover:bg-foreground/5 hover:text-foreground/80 transition-colors"
                data-testid="hr-rename-quick"
              >
                <PenLine className="size-3.5" />
              </button>
            </div>
            <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-foreground/75">
              {agent.persona || <span className="text-foreground/40">暂无人格描述</span>}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
                className="gap-1.5"
                data-testid="hr-edit"
              >
                <Edit className="size-3.5" /> 编辑
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="gap-1.5 text-rose-600 hover:text-rose-700"
                data-testid="hr-delete"
              >
                <Trash2 className="size-3.5" /> 删除
              </Button>
              <Link href={`/employees/recruit?hrId=${encodeURIComponent(agent.id)}`}>
                <Button size="sm" className="gap-1.5" data-testid="hr-recruit-primary">
                  <Sparkles className="size-3.5" /> 招聘
                </Button>
              </Link>
            </div>
            <div className="mt-2 rounded-2xl bg-muted/30 px-4 py-2.5 ring-1 ring-border text-right">
              <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">在用</div>
              <div className="font-mono text-2xl font-semibold tabular-nums">
                {usageCount} <span className="text-[12px] text-foreground/55">实例</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-7 flex flex-wrap gap-5 border-t border-border pt-4 text-[12px] font-mono text-foreground/55">
          <span className="inline-flex items-center gap-1.5">
            <User2 className="size-3" /> 静态配方
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Hash className="size-3" /> {agent.id.slice(0, 8)}…
          </span>
          <span className="ml-auto text-foreground/35">
            created {new Date(agent.createdAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="人格 · persona" hint="一句对外描述 · 60 字以内">
          {editing ? (
            <textarea
              value={editPersona}
              onChange={(e) => setEditPersona(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[14px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-foreground/40"
              data-testid="hr-edit-persona"
            />
          ) : (
            <div className="text-[14px] leading-relaxed text-foreground/85 whitespace-pre-wrap">
              {agent.persona || <span className="text-foreground/40">未设定</span>}
            </div>
          )}
        </Card>

        <Card title="分类 · category" hint="绘画/文案/运维/客服/调研/工程/通用">
          {editing ? (
            <select
              value={editCategory}
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[14px]"
              data-testid="hr-edit-category"
            >
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          ) : (
            <div>
              <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] ring-1", cat.tone)}>
                <cat.Icon className="size-3" />
                {cat.label}
              </span>
            </div>
          )}
        </Card>

        <Card title="角色 · role" hint="系统内部角色标识">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[13px] text-foreground/85 truncate">{agent.role}</div>
              {roleEditedAt && (
                <div className="mt-1 text-[10.5px] text-foreground/40">
                  最近改于 {new Date(roleEditedAt).toLocaleString("zh-CN")}
                </div>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setRoleEditValue(agent.role || "");
                setRoleEditError(null);
                setRoleEditOpen(true);
              }}
              className="h-8 gap-1.5 px-2.5 text-[12px]"
              data-testid="hr-edit-role-template"
            >
              <PenLine className="size-3" /> 编辑
            </Button>
          </div>
        </Card>
      </div>

      <Card title="系统提示词 · system_prompt" hint="完整的人设 / 风格 / 行为约定" wide>
        {editing ? (
          <textarea
            value={editSystemPrompt}
            onChange={(e) => setEditSystemPrompt(e.target.value)}
            rows={10}
            className="w-full rounded-md border border-border bg-background px-4 py-3 text-[13.5px] leading-relaxed font-mono focus:outline-none focus:ring-1 focus:ring-foreground/40"
            data-testid="hr-edit-system-prompt"
          />
        ) : (
          <pre className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground/85">
{agent.systemPrompt || "未设定"}
          </pre>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="铁律 · iron_laws" hint="每行一条 · 强制执行的硬约束">
          {editing ? (
            <textarea
              value={editIronLawsText}
              onChange={(e) => setEditIronLawsText(e.target.value)}
              rows={5}
              placeholder="例:不重复用户已经说过的话"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13.5px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-foreground/40"
              data-testid="hr-edit-iron-laws"
            />
          ) : (
            <ul className="space-y-1.5">
              {(agent.ironLaws ?? []).length === 0 && (
                <li className="text-[13px] text-foreground/40 italic">未设定</li>
              )}
              {(agent.ironLaws ?? []).map((law, i) => (
                <li key={i} className="flex items-start gap-2 text-[13.5px] leading-relaxed">
                  <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-rose-500" />
                  <span>{law}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="岗位类型 · template_type" hint="系统 / 自定义 / 内置">
          {editing ? (
            <select
              value={editTemplateType}
              onChange={(e) => setEditTemplateType(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[14px]"
              data-testid="hr-edit-template-type"
            >
              <option value="custom">用户自定义</option>
              <option value="system">系统预设</option>
              <option value="builtin">内置</option>
            </select>
          ) : (
            <div className="font-mono text-[13px] text-foreground/85">
              {TEMPLATE_TYPE_LABEL[templateTypeKey] ?? templateTypeKey}
            </div>
          )}
        </Card>

        <Card title="头像样式" hint="色调 + 字符">
          {editing ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {["新", "工", "文", "运", "客", "研", "守", "墨", "销", "服"].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setEditGlyph(g)}
                    className={cn(
                      "inline-flex size-9 items-center justify-center rounded-md text-base font-semibold ring-1 transition-all",
                      editGlyph === g
                        ? "ring-foreground shadow-md"
                        : "ring-border hover:ring-foreground/40"
                    )}
                    style={{ background: "var(--background)" }}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["amber", "rose", "teal", "sky", "indigo", "stone", "violet", "lime"].map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setEditHue(h)}
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-border",
                      editHue === h && "ring-2 ring-foreground"
                    )}
                    style={{ background: `var(--${h}-300, var(--foreground))` }}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <AvatarMark glyph={agent.glyph} hue={agent.hue} size="md" />
              <div className="font-mono text-[12px] text-foreground/55">
                {agent.glyph} · {agent.hue}
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card title="在用实例 · 谁用这个岗位" hint={`${usageCount} 个实例在用 · 都是独立员工`} wide>
        {usageInstances.length === 0 ? (
          <div className="rounded-md bg-muted/40 px-4 py-6 text-center text-[13px] text-foreground/55">
            还没有实例用这个岗位 · 点右上角"招聘"招第 1 个员工。
          </div>
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {usageInstances.map((inst) => (
              <li key={inst.id}>
                <Link
                  href={`/employees/${inst.id}`}
                  className="flex items-center gap-2 rounded-xl bg-muted/30 px-3 py-2 ring-1 ring-border hover:bg-muted/60"
                  data-testid={`hr-instance-${inst.id.slice(0, 8)}`}
                >
                  <AvatarMark glyph={inst.glyph} hue={inst.hue} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-semibold">
                      {inst.displayName || inst.name}
                    </div>
                    <div className="truncate text-[10.5px] font-mono text-foreground/45">
                      {inst.id.slice(0, 8)}…
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl bg-card p-3 ring-1 ring-border shadow-2xl">
          <div className="text-[12px] text-foreground/65">
            编辑模式 · 只能改静态字段(动态字段在员工详情里改)
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={onSaveEdit}
              disabled={saving}
              className="gap-1.5"
              data-testid="hr-save"
            >
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </div>
        </div>
      )}

      {/* R53-A3: role_template 编辑 Dialog */}
      <Dialog open={roleEditOpen} onOpenChange={(o) => {
        if (!roleEditBusy) {
          setRoleEditOpen(o);
          if (!o) setRoleEditError(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑内部角色标识</DialogTitle>
            <DialogDescription>
              系统内部岗位编码,调度层 / 路由层 / 资源分配层 用来匹配"系统内部岗位"的标识。
              <br />
              <span className="text-[11.5px] text-amber-700 dark:text-amber-300">
                提示:推荐使用 kebab-case 命名(如 <code>custom-pm-lead</code>)。
                修改后路由表/资源分配会按新标识匹配;改前快照会写入审计日志。
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="block">
              <span className="text-[12px] text-foreground/70">role_template</span>
              <input
                type="text"
                value={roleEditValue}
                onChange={(e) => {
                  setRoleEditValue(e.target.value);
                  if (roleEditError) setRoleEditError(null);
                }}
                placeholder="例:custom-pm-lead"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-[13.5px] focus:outline-none focus:ring-1 focus:ring-foreground/40"
                data-testid="hr-edit-role-template-input"
                autoFocus
                disabled={roleEditBusy}
              />
            </label>
            {roleEditError && (
              <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/30">
                {roleEditError}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRoleEditOpen(false); setRoleEditError(null); }}
              disabled={roleEditBusy}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={onSaveRoleTemplate}
              disabled={roleEditBusy || !roleEditValue.trim() || roleEditValue.trim() === (agent.role || "")}
              className="gap-1.5"
              data-testid="hr-edit-role-template-submit"
            >
              {roleEditBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* R55-B 2.4: 快速改名 Dialog — 只改 name, 不动其他字段 */}
      <Dialog
        open={renameOpen}
        onOpenChange={(v) => !renaming && setRenameOpen(v)}
      >
        <DialogContent className="max-w-md" data-testid="hr-rename-dialog">
          <DialogHeader>
            <DialogTitle>修改岗位名称</DialogTitle>
            <DialogDescription>
              只改名称,不动其他字段。点保存后立即生效。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/55">
              岗位名称
            </label>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !renaming) onConfirmRename();
              }}
              autoFocus
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[15px] focus:outline-none focus:ring-1 focus:ring-foreground/40"
              data-testid="hr-rename-input"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRenameOpen(false)}
              disabled={renaming}
              className="rounded-full px-4 py-2 text-[13px] text-foreground/65 hover:bg-foreground/5 disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={onConfirmRename}
              disabled={renaming || !renameValue.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-40"
              data-testid="hr-rename-submit"
            >
              {renaming && <Loader2 className="size-3.5 animate-spin" />}
              保存
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={deleteOpen} onOpenChange={(o) => { if (!deleting) setDeleteOpen(o); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除岗位「{agent.displayName || agent.name}」?</DialogTitle>
            <DialogDescription>
              {usageCount > 0
                ? `该操作不可撤销,且有 ${usageCount} 个实例正在使用这个岗位。`
                : "该操作不可撤销。"}
            </DialogDescription>
          </DialogHeader>
          {usageCount > 0 && (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/30">
              <strong>警告:</strong> 删了这个岗位后,{usageCount} 个实例的
              <code className="mx-1 rounded bg-amber-500/15 px-1 py-0.5 text-[11px]">source_template_id</code>
              会变成悬空引用 — 它们仍然独立运行,只是"祖辈"没了。
            </div>
          )}
          {usageCount === 0 && (
            <div className="rounded-md bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-700 dark:text-rose-300">
              没有实例在用这个岗位,可以安全删除。
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onConfirmDelete}
              disabled={deleting}
              data-testid="hr-delete-confirm"
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );

  async function onSaveRoleTemplate() {
    if (!agent) return;
    const trimmed = roleEditValue.trim();
    if (!trimmed) {
      setRoleEditError("roleTemplate 不能为空");
      return;
    }
    if (trimmed === (agent.role || "")) {
      setRoleEditError("与现有值相同,无需保存");
      return;
    }
    setRoleEditBusy(true);
    setRoleEditError(null);
    try {
      const updated = await updateAgent(agent.id, { roleTemplate: trimmed });
      if (updated) {
        setAgent(updated);
        setRoleEditedAt(new Date().toISOString());
        setRoleEditOpen(false);
        toast.success(`role_template 已更新为 "${trimmed}"`);
      } else {
        setRoleEditError("更新失败:服务端返回空");
      }
    } catch (e: any) {
      const code = e?.code || "";
      const msg = String(e?.message || e);
      // 兼容性:error code 可能在 e.error.code 或第一层
      const codeLow = (String(code).toLowerCase() + " " + msg.toLowerCase());
      if (codeLow.includes("role_template_taken")) {
        setRoleEditError(`role_template "${trimmed}" 已被其他 HR 占用,请换一个`);
      } else if (codeLow.includes("bad_request")) {
        setRoleEditError(`请求格式有误:${msg}`);
      } else {
        setRoleEditError(msg || "更新失败");
      }
    } finally {
      setRoleEditBusy(false);
    }
  }
}

function Card({
  title, hint, children, wide,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-3xl bg-card p-6 ring-1 ring-border",
      wide && "lg:col-span-3",
    )}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[12.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
          {title}
        </h3>
        {hint && <span className="text-[10.5px] text-foreground/35">{hint}</span>}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}
