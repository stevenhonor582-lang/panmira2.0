"use client";

import { Bot, ChevronRight, Hash, Power, Wrench, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Agent } from "./types";

interface Props {
  agent: Agent;
  onClick?: () => void;
}

export function AgentCard({ agent, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md hover:-translate-y-0.5 w-full"
    >
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center shrink-0">
          <Bot className="size-5" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold truncate">{agent.displayName || agent.name}</p>
            <Badge variant={agent.isActive ? "default" : "secondary"} className="text-[10px] shrink-0">
              <Power className="size-2.5 mr-0.5" />{agent.isActive ? "启用" : "停用"}
            </Badge>
          </div>
          <p className="text-[11px] font-mono text-muted-foreground truncate">{agent.name}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2.5em]">{agent.description || "—"}</p>
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <Badge variant="outline" className="text-[10px] gap-1">
              <Hash className="size-2.5" />{agent.roleTemplate}
            </Badge>
            {agent.capabilities?.slice(0, 2).map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px] gap-1">
                <Tag className="size-2.5" />{c}
              </Badge>
            ))}
            {agent.capabilities && agent.capabilities.length > 2 && (
              <span className="text-[10px] text-muted-foreground">+{agent.capabilities.length - 2}</span>
            )}
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Wrench className="size-2.5" />{agent.tools?.length ?? 0}
            </span>
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
      </div>
    </button>
  );
}
