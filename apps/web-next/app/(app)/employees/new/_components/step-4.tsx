"use client";
import * as React from "react";
import type { WizardForm, SkillInfo, McpServerInfo } from "./form";
import { BUILT_IN_TOOLS } from "./form";
import { Search, ChevronDown, ChevronRight, CheckCircle2, Info } from "lucide-react";

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
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/45">
          当前已选
        </span>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-mono text-foreground/85">
          <span><CheckCircle2 className="mr-1 inline size-3 text-emerald-600" />{form.skills.length} skill</span>
          <span><CheckCircle2 className="mr-1 inline size-3 text-emerald-600" />{form.mcpServerIds.length} mcp</span>
          <span><CheckCircle2 className="mr-1 inline size-3 text-emerald-600" />{form.tools.length} tool</span>
        </div>
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
        <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
          Skills · 技能 · 来自 /api/skills ({all.length} 个真实可用)
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {all.length}
        </span>
      </div>

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
        <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
          MCP Servers · 来自 /api/mcp/servers ({servers.length} 个真实接入)
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {servers.length}
        </span>
      </div>
      {servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-[12px] text-foreground/55">
          没有可用的 MCP server。请去 /channels/mcp 配置。
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
                    <div className="font-mono">url: {srv.url || "—"}</div>
                    <div className="font-mono mt-1">transport: {srv.transport} · status: {srv.status || "—"}</div>
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
        <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">
          Tools · 内置工具(每个都带说明)
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {selected.length} / {BUILT_IN_TOOLS.length}
        </span>
      </div>
      <p className="mb-3 text-[12px] text-foreground/55">
        SDK 级工具,与模型解耦。不是所有员工都需要全部工具,选最小必要集即可。
      </p>
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
