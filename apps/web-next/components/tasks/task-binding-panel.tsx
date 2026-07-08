"use client";

/**
 * R13-D: Task binding panel — owner, collaborators, participating bots.
 *
 * Shown on /tasks/[id]. Reads /api/v2/tasks/pipelines/:id/bindings and
 * PATCHes the same endpoint on change.
 *
 * Owner (1) + collaborators (N) + auto-derived participating bots (from DAG).
 */

import * as React from "react";
import {
  Bot,
  Check,
  Loader2,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Person {
  id: string;
  name?: string;
  email?: string;
}

interface BotRef {
  id: string;
  name?: string;
  status?: string;
}

interface Binding {
  pipelineId: string;
  pipelineName?: string;
  ownerId: string | null;
  owner: Person | null;
  collaborators: Person[];
  participatingBots: BotRef[];
}

function extractList<T>(r: unknown): T[] {
  if (!r || typeof r !== 'object') return [];
  const data = (r as { data?: unknown }).data;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

interface Props {
  pipelineId: string;
  /** Compact mode hides the outer card (used inside a sidebar). */
  embedded?: boolean;
}

export function TaskBindingPanel({ pipelineId, embedded }: Props) {
  const [binding, setBinding] = React.useState<Binding | null>(null);
  const [people, setPeople] = React.useState<Person[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingOwner, setSavingOwner] = React.useState(false);
  const [showCollabPicker, setShowCollabPicker] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load binding + people list
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bRes, pRes] = await Promise.all([
          api(`/api/v2/tasks/pipelines/${pipelineId}/bindings`) as Promise<{
            data?: Binding;
          }>,
          api("/api/v2/people?limit=100"),
        ]);
        if (cancelled) return;
        setBinding(bRes?.data ?? null);
        setPeople(extractList<Person>(pRes));
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载绑定失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipelineId]);

  const setOwner = React.useCallback(
    async (ownerId: string | null) => {
      if (!pipelineId) return;
      setSavingOwner(true);
      setError(null);
      try {
        await api(`/api/v2/tasks/pipelines/${pipelineId}/bindings`, {
          method: "PATCH",
          body: { ownerId },
        });
        // optimistic refresh
        setBinding((prev) =>
          prev
            ? {
                ...prev,
                ownerId,
                owner: ownerId
                  ? (people.find((p) => p.id === ownerId) ?? null)
                  : null,
              }
            : prev,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      } finally {
        setSavingOwner(false);
      }
    },
    [pipelineId, people],
  );

  const toggleCollaborator = React.useCallback(
    async (personId: string) => {
      if (!binding) return;
      const isOn = binding.collaborators.some((c) => c.id === personId);
      const next = isOn
        ? binding.collaborators.filter((c) => c.id !== personId)
        : [
            ...binding.collaborators,
            people.find((p) => p.id === personId)!,
          ].filter(Boolean);
      const nextIds = next.map((c) => c.id);
      try {
        await api(`/api/v2/tasks/pipelines/${pipelineId}/bindings`, {
          method: "PATCH",
          body: { collaboratorIds: nextIds },
        });
        setBinding({ ...binding, collaborators: next });
      } catch (e) {
        setError(e instanceof Error ? e.message : "保存失败");
      }
    },
    [binding, people, pipelineId],
  );

  if (loading) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin mr-1.5 inline-block" />
        加载任务分配…
      </div>
    );
  }

  if (!binding) {
    return (
      <div className="px-3 py-4 text-xs text-rose-600">
        {error ?? "无法加载任务分配"}
      </div>
    );
  }

  return (
    <div className={cn(!embedded && "rounded-lg ring-1 ring-foreground/10 bg-card p-3 space-y-3")}>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        任务分配
      </div>

      {error && (
        <div className="text-[11px] text-rose-600 bg-rose-50 ring-1 ring-rose-200 rounded px-2 py-1">
          {error}
        </div>
      )}

      {/* Owner */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
          <UserRound className="size-3" />
          负责人
        </div>
        <div className="flex items-center gap-2">
          <select
            value={binding.ownerId ?? ""}
            onChange={(e) => setOwner(e.target.value || null)}
            disabled={savingOwner}
            className="flex-1 h-8 px-2 rounded-md ring-1 ring-foreground/15 bg-background text-xs"
          >
            <option value="">— 未指派 —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.email || p.id}
              </option>
            ))}
          </select>
          {savingOwner && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {/* Collaborators */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1 flex items-center justify-between">
          <span>协作的人 ({binding.collaborators.length})</span>
          <button
            type="button"
            onClick={() => setShowCollabPicker((v) => !v)}
            className="text-[10px] inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            <UserPlus className="size-3" />
            管理
          </button>
        </div>
        {binding.collaborators.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">暂无协作者</div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {binding.collaborators.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-[10px]"
              >
                <UserRound className="size-2.5" />
                {c.name || c.email || c.id}
              </span>
            ))}
          </div>
        )}
        {showCollabPicker && (
          <div className="mt-2 rounded-md ring-1 ring-foreground/15 max-h-[200px] overflow-y-auto">
            {people.map((p) => {
              const on = binding.collaborators.some((c) => c.id === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleCollaborator(p.id)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 text-xs hover:bg-muted",
                    on && "bg-primary/5",
                  )}
                >
                  <span className="truncate">{p.name || p.email || p.id}</span>
                  {on && <Check className="size-3 text-primary" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Participating bots (read-only — derived from DAG) */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1">
          <Bot className="size-3" />
          参与的数字员工 ({binding.participatingBots.length})
        </div>
        {binding.participatingBots.length === 0 ? (
          <div className="text-[10px] text-muted-foreground italic">
            DAG 中暂无 Bot 节点
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {binding.participatingBots.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 ring-1 ring-sky-200 text-[10px]"
              >
                <Bot className="size-2.5" />
                {b.name || b.id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default TaskBindingPanel;
