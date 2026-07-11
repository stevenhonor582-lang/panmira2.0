"use client";
import * as React from "react";
import type { WizardForm, SkillInfo, McpServerInfo } from "./form";
import { BUILT_IN_TOOLS } from "./form";
import { Plus, X, Search, CheckCircle2, Info, AlertCircle } from "lucide-react";

/**
 * Step 4 — 能力装载
 * R66-B (块 3.2):
 *   - 技能 / 外接能力 / 内部工具三类资源统一走弹窗选择
 *   - 选中项以 chip 标签展示,可单独删除,可再次打开弹窗重新选择
 *   - 外接能力增加描述字段(后端未返则前端按 id 兜底)
 */
export function Step4({ form, setForm, skills, mcpServers }: {
  form: WizardForm; setForm: (v: WizardForm) => void;
  skills: SkillInfo[]; mcpServers: McpServerInfo[];
}) {
  return (
    <div className="space-y-7">
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          <Info className="size-3" />能力装载 · 三段
        </div>
        <ul className="space-y-1.5 font-mono text-[11.5px]">
          <li>
            <b className="text-foreground/85">技能</b>
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">必选</span>
            <span className="ml-1.5">· 来自技能库 · 至少选一个才能发布</span>
          </li>
          <li>
            <b className="text-foreground/85">外接能力</b>
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-foreground/55">可选</span>
            <span className="ml-1.5">· 接入的外部服务,不强求</span>
          </li>
          <li>
            <b className="text-foreground/85">内部工具</b>
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] tracking-[0.12em] text-foreground/55">权限管理</span>
            <span className="ml-1.5">· 勾选 = 授予调用权限,不勾 = 不可用</span>
          </li>
        </ul>
      </div>
      <SkillPicker all={skills} selected={form.skills} onToggle={(id) => toggleList(form, setForm, "skills", id)} />
      <McpPicker servers={mcpServers} selected={form.mcpServerIds} onToggle={(id) => toggleList(form, setForm, "mcpServerIds", id)} />
      <ToolPicker selected={form.tools} onToggle={(id) => toggleList(form, setForm, "tools", id)} />
      <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">当前已选</span>
          <span className="font-mono text-[11px] text-foreground/55">
            技能 {form.skills.length} · 外接 {form.mcpServerIds.length} · 内部 {form.tools.length}
          </span>
        </div>
        {form.skills.length === 0 && (
          <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <span>技能是必选项,至少选 1 个才能发布。</span>
          </div>
        )}
      </div>
    </div>
  );
}

function toggleList<K extends "skills" | "mcpServerIds" | "tools">(form: WizardForm, setForm: (v: WizardForm) => void, k: K, v: string) {
  const list = form[k];
  setForm({ ...form, [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
}

interface ResourceItem { id: string; title: string; hint?: string; description?: string; }function ResourcePicker({
  title, badge, required, hint, options, selected, onToggle, resolveDescription, emptyText,
}: {
  title: string;
  badge?: { label: string; tone: "rose" | "muted" };
  required?: boolean;
  hint?: string;
  options: ResourceItem[];
  selected: string[];
  onToggle: (id: string) => void;
  resolveDescription: (opt: ResourceItem) => string | undefined;
  emptyText: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const selectedItems = selected.map((id) => options.find((o) => o.id === id)).filter((x): x is ResourceItem => Boolean(x));
  const missingFromCatalog = selected.filter((id) => !options.find((o) => o.id === id)).map<ResourceItem>((id) => ({ id, title: id }));
  const allShown = [...selectedItems, ...missingFromCatalog];
  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => `${o.id} ${o.title} ${o.hint || ""} ${o.description || ""}`.toLowerCase().includes(needle));
  }, [options, q]);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          {title}
          {badge?.tone === "rose" && (
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">{badge.label}</span>
          )}
          {badge?.tone === "muted" && (
            <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-foreground/55">{badge.label}</span>
          )}
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">{selected.length} / {options.length}</span>
      </div>
      {hint && <p className="mb-3 text-[11.5px] text-foreground/55">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3 ring-1 ring-border">
        {allShown.length === 0 && <span className="font-mono text-[11px] italic text-foreground/40">还没有选择 — 点击右侧"+"按钮打开弹窗</span>}
        {allShown.map((o) => (
          <span key={o.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-foreground/5 py-1 pl-2.5 pr-1 text-[12px] ring-1 ring-border">
            <span className="truncate font-medium">{o.title}</span>
            <button type="button" onClick={() => onToggle(o.id)} aria-label={`移除 ${o.title}`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-foreground/55 hover:bg-foreground/10 hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1 text-[12px] font-medium text-background hover:opacity-90">
          <Plus className="size-3.5" />选择{title}
        </button>
      </div>
      {required && selected.length === 0 && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] text-rose-700 dark:text-rose-300">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span>{title}是必选项,至少选 1 个才能发布。</span>
        </div>
      )}
      {open && (
        <Dialog onClose={() => { setOpen(false); setQ(""); }}>
          <DialogHeader title={`选择${title}`} count={`${selected.length} / ${options.length}`} onClose={() => { setOpen(false); setQ(""); }} />
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/45" />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={`搜索${title}名 / 描述...`}
                className="w-full rounded-xl bg-background pl-9 pr-3 py-2 text-[13px] ring-1 ring-border focus:outline-none focus:ring-foreground/40" autoFocus />
            </div>
          </div>
          <DialogBody>
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-foreground/55">{emptyText}</div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((o) => {
                  const on = selected.includes(o.id);
                  const desc = resolveDescription(o);
                  return (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40">
                        <input type="checkbox" checked={on} onChange={() => onToggle(o.id)} className="mt-0.5 size-4 shrink-0 accent-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-[12.5px] text-foreground/90">{o.id}</span>
                            <span className="text-[13px] font-medium">{o.title}</span>
                            {o.hint && <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">{o.hint}</span>}
                            {on && <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />}
                          </div>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/65">
                            {desc || <span className="italic text-foreground/40">暂无说明</span>}
                          </p>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </DialogBody>
          <DialogFooter onClose={() => { setOpen(false); setQ(""); }}>
            <span className="font-mono text-[11px] text-foreground/55">已选 {selected.length} 项 · 可继续打开弹窗修改</span>
          </DialogFooter>
        </Dialog>
      )}
    </section>
  );
}function SkillPicker({ all, selected, onToggle }: { all: SkillInfo[]; selected: string[]; onToggle: (id: string) => void; }) {
  const options = React.useMemo(() => all.map((s) => ({ id: s.id, title: s.name, hint: s.source, description: s.description })), [all]);
  return (
    <ResourcePicker title="技能" badge={{ label: "必选", tone: "rose" }} required
      hint="至少选 1 个技能才能发布 — 技能是员工「能做什么」的核心。"
      options={options} selected={selected} onToggle={onToggle}
      resolveDescription={(o) => o.description} emptyText="没找到匹配的技能。" />
  );
}

function McpPicker({ servers, selected, onToggle }: { servers: McpServerInfo[]; selected: string[]; onToggle: (id: string) => void; }) {
  const options = React.useMemo(() => servers.map((s) => ({
    id: s.id, title: s.name, hint: s.transport,
    description: s.description || mcpFallbackDesc(s.name, s.url, s.transport),
  })), [servers]);
  return (
    <ResourcePicker title="外接能力" badge={{ label: "可选", tone: "muted" }}
      hint="平常常用的接进来 — 不选也能正常用,只是不能用这些外部能力。每项已附用途说明。"
      options={options} selected={selected} onToggle={onToggle}
      resolveDescription={(o) => o.description} emptyText="还没有接入任何外部服务。可以去 渠道管理 接入。" />
  );
}

function ToolPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void; }) {
  const options = React.useMemo(() => BUILT_IN_TOOLS.map((t) => ({ id: t.id, title: t.label, description: t.description })), []);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          内部工具
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-foreground/55">权限管理</span>
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">{selected.length} / {BUILT_IN_TOOLS.length}</span>
      </div>
      <div className="mb-3 rounded-xl bg-amber-500/10 p-3 text-[11.5px] leading-relaxed text-foreground/75 ring-1 ring-amber-500/25">
        <div className="flex items-start gap-1.5">
          <Info className="mt-0.5 size-3 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <b className="text-foreground/85">工具 = 权限管理</b>
            <span className="ml-1.5">勾选 = 授予这位员工调用这个工具的权限;</span>
            <span className="ml-1">不勾 = 不可用。最小授权,选员工真正需要的即可。</span>
          </div>
        </div>
      </div>
      <ResourcePicker title="内部工具" options={options} selected={selected} onToggle={onToggle}
        resolveDescription={(o) => o.description} emptyText="没有可用的工具。" />
    </section>
  );
}

function mcpFallbackDesc(name: string, url?: string, transport?: string): string {
  const key = `${name} ${url || ""}`.toLowerCase();
  const rules: { pattern: RegExp; text: string }[] = [
    { pattern: /notion|wiki|confluence/, text: "对接文档 / Wiki 系统,可检索与写入知识条目" },
    { pattern: /github|gitlab/, text: "对接代码仓库,可读取代码、提交 PR、查询 Issue" },
    { pattern: /slack|feishu|dingtalk|lark|teams/, text: "对接即时通讯,可发送消息、读取频道历史" },
    { pattern: /jira|linear/, text: "对接项目管理,可创建 / 查询工单、跟踪进度" },
    { pattern: /salesforce|hubspot/, text: "对接 CRM,可查询客户档案、写入跟进记录" },
    { pattern: /stripe|paypal/, text: "对接支付,可查询订单、退款、订阅状态" },
    { pattern: /postgres|mysql|sql|redis/, text: "对接数据库,可执行查询(需谨慎授权)" },
    { pattern: /s3|oss|storage/, text: "对接对象存储,可读写文件、上传下载" },
    { pattern: /openapi|swagger|api/, text: "通用 HTTP 接口桥,按 OpenAPI 规范调用第三方服务" },
  ];
  for (const r of rules) if (r.pattern.test(key)) return r.text;
  const tr = transport ? transport.toUpperCase() : "MCP";
  return `${tr} 协议接入的外部服务 — 通过标准 MCP 调用约定对接`;
}function Dialog({ onClose, children }: { onClose: () => void; children: React.ReactNode; }) {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className="mt-10 w-full max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border">{children}</div>
    </div>
  );
}

function DialogHeader({ title, count, onClose }: { title: string; count?: string; onClose: () => void; }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="flex items-baseline gap-2">
        <h4 className="text-[14px] font-semibold tracking-tight">{title}</h4>
        {count && <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">{count}</span>}
      </div>
      <button type="button" onClick={onClose} aria-label="关闭"
        className="inline-flex size-7 items-center justify-center rounded-full text-foreground/55 hover:bg-muted/60 hover:text-foreground">
        <X className="size-4" />
      </button>
    </div>
  );
}

function DialogBody({ children }: { children: React.ReactNode; }) {
  return <div className="max-h-[60vh] overflow-y-auto">{children}</div>;
}

function DialogFooter({ children, onClose }: { children: React.ReactNode; onClose: () => void; }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-3">
      <div>{children}</div>
      <button type="button" onClick={onClose}
        className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-1.5 text-[12.5px] font-medium text-background hover:opacity-90">
        完成
      </button>
    </div>
  );
}