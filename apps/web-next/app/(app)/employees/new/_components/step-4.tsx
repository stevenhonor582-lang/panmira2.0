"use client";
import * as React from "react";
import type { WizardForm } from "./form";

const ALL_SKILLS = [
  "code-review", "refactor", "tdd-red-green", "style-三档切换", "去AI味",
  "pptx-builder", "deployment", "monitoring", "incident-triage",
  "infra-iac", "db-schema", "memory-layer", "e2e-run", "snapshot",
];

const ALL_MCP = ["github", "filesystem", "google-slides", "notion", "aws", "pagerduty", "postgres", "redis", "argo", "playwright"];

const ALL_TOOLS = ["Bash", "Edit", "Read", "Write", "WebFetch", "Kubectl", "Grep", "Glob"];

export function Step4({ form, setForm }: { form: WizardForm; setForm: (v: WizardForm) => void }) {
  const toggle = (k: "skills" | "mcpServers" | "tools", v: string) => {
    const list = form[k];
    setForm({
      ...form,
      [k]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v],
    });
  };

  return (
    <div className="space-y-7">
      <Group
        label="Skills · 技能"
        hint="多选,选得越多这位 bot 越强,但调用也越贵。"
        options={ALL_SKILLS}
        active={form.skills}
        onToggle={(v) => toggle("skills", v)}
        field="skills"
      />
      <Group
        label="MCP Servers"
        hint="对接外部服务,不是所有 bot 都需要。"
        options={ALL_MCP}
        active={form.mcpServers}
        onToggle={(v) => toggle("mcpServers", v)}
        field="mcpServers"
      />
      <Group
        label="Tools · 工具"
        hint="openai-function 风格的工具,与模型解耦。"
        options={ALL_TOOLS}
        active={form.tools}
        onToggle={(v) => toggle("tools", v)}
        field="tools"
      />

      <div className="rounded-2xl bg-muted/30 p-4 ring-1 ring-border">
        <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
          当前已选
        </span>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] font-mono text-foreground/85">
          <span>{form.skills.length} skill{form.skills.length === 1 ? "" : "s"}</span>
          <span>{form.mcpServers.length} mcp</span>
          <span>{form.tools.length} tool{form.tools.length === 1 ? "" : "s"}</span>
        </div>
      </div>
    </div>
  );
}

function Group({
  label,
  hint,
  options,
  active,
  onToggle,
}: {
  label: string;
  hint: string;
  options: string[];
  active: string[];
  onToggle: (v: string) => void;
  field: "skills" | "mcpServers" | "tools";
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-medium tracking-tight text-foreground/65">{label}</h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/40">
          {active.length} of {options.length}
        </span>
      </div>
      <p className="mb-3 text-[12px] text-foreground/55">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = active.includes(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onToggle(o)}
              className={
                "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ring-1 " +
                (on
                  ? "bg-foreground text-background ring-foreground"
                  : "bg-card text-foreground/75 ring-border hover:text-foreground hover:ring-foreground/30")
              }
            >
              {o}
            </button>
          );
        })}
      </div>
    </section>
  );
}
