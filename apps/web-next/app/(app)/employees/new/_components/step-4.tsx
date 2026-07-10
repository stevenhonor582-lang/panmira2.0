"use client";
import * as React from "react";
import type { WizardForm, SkillInfo, McpServerInfo } from "./form";
import { BUILT_IN_TOOLS } from "./form";
import { Search, ChevronDown, ChevronRight, CheckCircle2, Info, AlertCircle } from "lucide-react";

/**
 * Step 4 — 能力装载
 * R51-B3:
 *   - 技能 (skill) 必选 — 至少选一个才能发布
 *   - 外接能力 (MCP Server) 可选 — 平常常用的接进来
 *   - 内部工具 = 权限管理 — 勾选 = 授予调用权限,不勾 = 不可用
 */
export function Step4({
  form,
  setForm,
  skills,
  mcpServers,
}: {
  form: WizardForm;
  setForm: (v: WizardForm) => void;
  skills: SkillInfo[];
  mcpServers: McpServerInfo[];
}) {
  return (
    <div className="space-y-7">
      <div className="rounded-2xl bg-muted/40 p-4 text-[12px] leading-relaxed text-foreground/70 ring-1 ring-border">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          <Info className="size-3" />
          能力装载 · 三段
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

      <SkillPicker
        all={skills}
        selected={form.skills}
        onToggle={(id) => toggleList(form, setForm, "skills", id)}
      />
      <McpPicker
        servers={mcpServers}
        selected={form.mcpServerIds}
        onToggle={(id) => toggleList(form, setForm, "mcpServerIds", id)}
      />
      <ToolPicker
        selected={form.tools}
        onToggle={(id) => toggleList(form, setForm, "tools", id)}
      />

      <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
            当前已选
          </span>
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

function toggleList<K extends "skills" | "mcpServerIds" | "tools">(
  form: WizardForm,
  setForm: (v: WizardForm) => void,
  k: K,
  v: string,
) {
  const list = form[k];
  setForm({
    ...form,
    [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v],
  });
}

function SkillPicker({
  all,
  selected,
  onToggle,
}: {
  all: SkillInfo[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [q, setQ] = React.useState("");
  const [tag, setTag] = React.useState<string>("all");

  const tags = React.useMemo(() => {
    const set = new Set<string>();
    all.forEach((s) => (s.tags || []).forEach((t) => set.add(t)));
    if (set.size === 0) return ["all"];
    return ["all", ...Array.from(set).sort()];
  }, [all]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((s) => {
      if (tag !== "all" && !(s.tags || []).includes(tag)) return false;
      if (!needle) return true;
      const hay = `${s.id} ${s.name} ${s.description || ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [all, q, tag]);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          技能
          <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-rose-700 dark:text-rose-300">必选</span>
          <span className="font-mono text-[10.5px] text-foreground/45">· 来自技能库</span>
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {all.length}
        </span>
      </div>
      <p className="mb-3 text-[11.5px] text-foreground/55">
        至少选 1 个技能才能发布 — 技能是员工"能做什么"的核心。
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-foreground/45" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索技能名 / 描述 / 标签..."
            className="w-full rounded-xl bg-background pl-9 pr-3 py-2 text-[13px] ring-1 ring-border focus:outline-none focus:ring-foreground/40"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              className={
                "rounded-full px-2.5 py-1 text-[11.5px] font-mono ring-1 transition-all " +
                (tag === t ? "bg-foreground text-background ring-foreground" : "bg-card text-foreground/65 ring-border hover:ring-foreground/30")
              }
            >
              {t === "all" ? "全部" : t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
          没找到匹配的技能。
        </div>
      ) : (
        <ul className="max-h-80 overflow-auto divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
          {filtered.slice(0, 120).map((s) => {
            const on = selected.includes(s.id);
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 hover:bg-muted/40">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(s.id)}
                    className="mt-0.5 size-4 accent-foreground"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12.5px] text-foreground/90">{s.id}</span>
                      {s.source && (
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                          {s.source}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-foreground/65">
                      {s.description || <span className="italic text-foreground/40">暂无说明</span>}
                    </p>
                  </div>
                </label>
              </li>
            );
          })}
          {filtered.length > 120 && (
            <li className="px-4 py-2 text-center font-mono text-[11px] text-foreground/45">
              还有 {filtered.length - 120} 个未显示,用搜索缩小范围
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function McpPicker({
  servers,
  selected,
  onToggle,
}: {
  servers: McpServerInfo[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = React.useState<string | null>(servers[0]?.id ?? null);
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          外接能力
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-foreground/55">可选</span>
          <span className="font-mono text-[10.5px] text-foreground/45">· 接入的外部服务</span>
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {servers.length}
        </span>
      </div>
      <p className="mb-3 text-[11.5px] text-foreground/55">
        平常常用的接进来 — 不选也能正常用,只是不能用这些外部能力。
      </p>
      {servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
          还没有接入任何外部服务。可以去 渠道管理 接入。
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl bg-card ring-1 ring-border">
          {servers.map((srv) => {
            const on = selected.includes(srv.id);
            const isOpen = open === srv.id;
            return (
              <li key={srv.id}>
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => onToggle(srv.id)}
                    className="size-4 accent-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : srv.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {isOpen ? <ChevronDown className="size-3.5 text-foreground/45" /> : <ChevronRight className="size-3.5 text-foreground/45" />}
                    <span className="text-[13px] font-medium">{srv.name}</span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
                      {srv.transport}
                    </span>
                    {srv.health && (
                      <span className={
                        "font-mono text-[10.5px] uppercase tracking-[0.18em] " +
                        (srv.health === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                      }>
                        {srv.health}
                      </span>
                    )}
                  </button>
                </div>
                {isOpen && (
                  <div className="bg-muted/20 px-4 py-2.5 text-[11.5px] text-foreground/65">
                    <div className="font-mono">地址: {srv.url || "—"}</div>
                    <div className="font-mono mt-1">传输方式: {srv.transport} · 状态: {srv.status || "—"}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ToolPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-foreground/85">
          内部工具
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-foreground/55">权限管理</span>
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {BUILT_IN_TOOLS.length}
        </span>
      </div>
      {/* R51-B3: 工具 = 权限管理 — 语义明确:勾选 = 授予调用权限,不勾 = 不可用 */}
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
      <ul className="grid gap-2 sm:grid-cols-2">
        {BUILT_IN_TOOLS.map((t) => {
          const on = selected.includes(t.id);
          return (
            <li key={t.id}>
              <label
                className={
                  "flex h-full cursor-pointer items-start gap-2.5 rounded-xl p-3 ring-1 transition-all " +
                  (on ? "bg-foreground/5 ring-foreground" : "bg-card ring-border hover:ring-foreground/30")
                }
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(t.id)}
                  className="mt-0.5 size-4 accent-foreground"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12.5px] font-medium">{t.label}</span>
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">{t.id}</span>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-foreground/65">{t.description}</p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
