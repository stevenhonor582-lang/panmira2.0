import * as React from "react";
import { useAgent, useAgents, findAgent, type Agent } from "../../_lib/data";
import { BrainCircuit, ShieldCheck } from "lucide-react";

export function TabPersona({ id }: { id: string }) {
  const { agent, loading: agentLoading } = useAgent(id);
  if (agentLoading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section>
        <SectionHead icon={BrainCircuit}>Persona · 人格短句</SectionHead>
        <p className="rounded-2xl bg-card p-6 text-[17px] leading-relaxed ring-1 ring-border">
          {agent.persona}
        </p>

        <SectionHead icon={BrainCircuit}>System Prompt · 摘要</SectionHead>
        <pre className="overflow-hidden rounded-2xl bg-card p-6 text-[13px] leading-relaxed ring-1 ring-border font-mono">{`你是 ${agent.displayName}。
你的角色:${agent.role}。
你的复杂度等级:${agent.complexity}。
你的工作准则,必须遵守 ${agent.ironLaws.length} 条铁律。

${agent.ironLaws.map((l, i) => `${i + 1}. ${l}`).join("\n")}

# 输出风格
- 用人话,不堆术语
- 结论先行,不要绕
- 数字必须有出处,不杜撰
- 默认中文;客户问英文再切英文`}</pre>
      </section>

      <section>
        <SectionHead icon={ShieldCheck}>五条铁律 · Iron Laws</SectionHead>
        <ol className="space-y-2.5">
          {agent.ironLaws.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground/50">
              这位 bot 还没设铁律
            </li>
          ) : (
            agent.ironLaws.map((law, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-2xl bg-card p-4 ring-1 ring-border"
              >
                <span className="font-mono text-[11px] text-foreground/35 tabular-nums">
                  0{i + 1}
                </span>
                <p className="text-[14.5px] leading-relaxed text-foreground/90">{law}</p>
              </li>
            ))
          )}
        </ol>
      </section>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <h3 className="mb-3 mt-7 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
      <Icon className="size-4 text-foreground/45" />
      {children}
    </h3>
  );
}
