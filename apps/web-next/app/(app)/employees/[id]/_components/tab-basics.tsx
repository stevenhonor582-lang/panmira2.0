import * as React from "react";
import { AGENTS, findAgent } from "../../_lib/data";
import { Calendar, Tag, Cpu, GitBranch, User2 } from "lucide-react";

export function TabBasics({ id }: { id: string }) {
  const agent = findAgent(id) ?? AGENTS[0];
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <Field label="描述" icon={Tag}>
          <p className="text-[15px] leading-relaxed">{agent.description}</p>
        </Field>
        <Field label="角色模板" icon={Cpu}>
          <code className="font-mono text-[13px] tracking-tight">{agent.role}</code>
        </Field>
        <Field label="系统提示词摘要" icon={GitBranch}>
          <pre className="overflow-hidden rounded-2xl bg-muted/50 p-4 font-mono text-[12.5px] leading-relaxed">
{`你 = ${agent.displayName}
role = ${agent.role}
owner = ${agent.ownerName}
model = ${agent.model}
temperature = ${agent.temperature}
complexity = ${agent.complexity}

# Persona
${agent.persona}`}
          </pre>
        </Field>
      </div>

      <div className="space-y-3 rounded-2xl bg-muted/30 p-5">
        <Field label="主理人" icon={User2}>
          <span className="font-medium">{agent.ownerName}</span>
        </Field>
        <Field label="模板来源" icon={GitBranch}>
          {agent.templateSource ? (
            <span className="font-mono text-[12.5px]">{agent.templateSource.slice(0, 8)}…</span>
          ) : (
            <span className="text-foreground/50">原创</span>
          )}
        </Field>
        <Field label="版本" icon={Tag}>
          <span className="font-mono">v{agent.version}</span>
        </Field>
        <Field label="创建于" icon={Calendar}>
          <span className="font-mono text-[12.5px]">
            {new Date(agent.createdAt).toLocaleString("zh-CN", { hour12: false })}
          </span>
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.22em] text-foreground/45">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div className="text-foreground/85">{children}</div>
    </div>
  );
}
