import * as React from "react";
import { AGENTS, findAgent, type Agent } from "../../_lib/data";
import { AvatarMark } from "../../_components/avatar-mark";
import { Network, Bot, User2 } from "lucide-react";
import Link from "next/link";

export function TabCollab({ id }: { id: string }) {
  const agent = findAgent(id);
  if (!agent) return null;

  const botNeighbours = agent.collaborators
    .filter((c) => c.botId)
    .map((c) => ({ agent: AGENTS.find((a) => a.id === c.botId), relation: c.relation }))
    .filter((c): c is { agent: Agent; relation: string } => !!c.agent);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
          <Network className="size-4 text-foreground/45" />
          协作关系图
        </h3>
        <div className="relative rounded-3xl bg-muted/40 p-8 ring-1 ring-border">
          {/* SVG arcs */}
          <svg
            className="absolute inset-0 pointer-events-none"
            viewBox="0 0 400 280"
            preserveAspectRatio="none"
            aria-hidden
          >
            {botNeighbours.map((_, i) => {
              const cx = 200;
              const cy = 140;
              const angle = (Math.PI / (botNeighbours.length + 1)) * (i + 1);
              const tx = 200 + Math.cos(angle) * 140;
              const ty = 140 + Math.sin(angle) * 100;
              return (
                <path
                  key={i}
                  d={`M ${cx} ${cy} Q ${(cx + tx) / 2} ${Math.min(cy, ty) - 40} ${tx} ${ty}`}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity="0.18"
                  strokeDasharray="3 4"
                  className="text-foreground"
                />
              );
            })}
          </svg>

          <div className="relative grid grid-cols-3 grid-rows-3 gap-6 place-items-center min-h-[260px]">
            {/* center */}
            <div className="col-start-2 row-start-2 flex flex-col items-center gap-2">
              <AvatarMark glyph={agent.glyph} hue={agent.hue} size="lg" />
              <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/55">
                {agent.displayName} · me
              </span>
            </div>
            {/* neighbours around */}
            {botNeighbours.map((n, i) => {
              const slots = [
                "col-start-1 row-start-1",
                "col-start-3 row-start-1",
                "col-start-1 row-start-3",
                "col-start-3 row-start-3",
              ];
              return (
                <Link
                  key={n.agent.id}
                  href={`/employees/${n.agent.id}`}
                  className={`${slots[i]} flex flex-col items-center gap-2 transition-transform hover:-translate-y-0.5`}
                >
                  <AvatarMark glyph={n.agent.glyph} hue={n.agent.hue} size="md" />
                  <span className="text-[11px] font-medium">{n.agent.displayName}</span>
                  <span className="text-[10px] font-mono text-foreground/45 max-w-[8ch] text-center">
                    {n.relation}
                  </span>
                </Link>
              );
            })}
            {botNeighbours.length === 0 && (
              <span className="col-span-3 text-center text-[13px] text-foreground/45">
                这位 bot 还没有协作关系
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <User2 className="size-4 text-foreground/45" />
            与真人 · Human owners
          </h3>
          <ul className="space-y-2">
            <li className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
              <span className="text-[13.5px]">主理人 · 史德飞</span>
              <span className="font-mono text-[11px] text-foreground/45">业务所有者</span>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
            <Bot className="size-4 text-foreground/45" />
            与 Bot · Bot network
          </h3>
          {botNeighbours.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-foreground/55">
              这位 bot 暂无上下游 bot 关系
            </div>
          ) : (
            <ul className="space-y-2">
              {botNeighbours.map((n) => (
                <li
                  key={n.agent.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-border"
                >
                  <div className="flex items-center gap-3">
                    <AvatarMark glyph={n.agent.glyph} hue={n.agent.hue} size="sm" />
                    <span className="text-[13.5px] font-medium">{n.agent.displayName}</span>
                  </div>
                  <span className="font-mono text-[11px] text-foreground/45">{n.relation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
