import * as React from "react";
import { useAgent, useAgents, findAgent, type Agent } from "../../_lib/data";
import { Wrench, Plug, Terminal } from "lucide-react";

export function TabSkills({ id }: { id: string }) {
  const { agent, loading: agentLoading } = useAgent(id);
  if (agentLoading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Group icon={Wrench} title="Skills" empty="这位 bot 还没有附加 skill">
        {agent.skills.map((s) => (
          <li key={s} className="rounded-xl bg-card px-3 py-2 ring-1 ring-border font-mono text-[12.5px]">
            {s}
          </li>
        ))}
      </Group>
      <Group icon={Plug} title="MCP Servers" empty="尚未对接任何 MCP 服务">
        {agent.mcpServers.map((s) => (
          <li key={s} className="flex items-center justify-between rounded-xl bg-card px-3 py-2 ring-1 ring-border font-mono text-[12.5px]">
            <span>{s}</span>
            <span className="size-1.5 rounded-full bg-emerald-500" />
          </li>
        ))}
      </Group>
      <Group icon={Terminal} title="Tools" empty="工具尚未启用">
        {agent.tools.map((t) => (
          <li key={t} className="rounded-xl bg-card px-3 py-2 ring-1 ring-border font-mono text-[12.5px]">
            {t}
          </li>
        ))}
      </Group>
    </div>
  );
}

function Group({
  icon: Icon,
  title,
  empty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const arr = React.Children.toArray(children);
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
        <Icon className="size-4 text-foreground/45" />
        {title}
      </h3>
      {arr.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-[13px] text-foreground/50">
          {empty}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">{children}</ul>
      )}
    </section>
  );
}
