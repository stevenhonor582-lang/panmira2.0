"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { api } from "@/lib/api";
import { AvatarMark } from "../../_components/avatar-mark";
import { Network, Bot, User2 } from "lucide-react";
import {
  EditPane,
  EditBar,
  EditableSelect,
  agentToDraft,
  diffDraft,
} from "./edit-mode";

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
}

const FIELDS = ["owner_user_id"];

export function TabCollab({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});
  const [people, setPeople] = React.useState<Person[]>([]);

  // 拉 users 列表(进入页面就拉一次)
  const loadPeople = React.useCallback(async () => {
    try {
      const res = await api<{ data?: { items?: Person[] } } | { items?: Person[] }>(
        "/api/v2/people?limit=100",
      );
      const items = (res as any)?.data?.items ?? (res as any)?.items ?? [];
      setPeople(items);
    } catch {
      setPeople([]);
    }
  }, []);

  React.useEffect(() => {
    if (agent) {
      const d = agentToDraft(agent, FIELDS);
      setDraft(d);
      setOrigDraft(d);
    }
  }, [agent?.id, agent?.updatedAt]);

  React.useEffect(() => {
    void loadPeople();
  }, [loadPeople]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const ownerId = String(
    draft.owner_user_id ?? (agent.raw as any)?.owner_user_id ?? "",
  );
  const ownerName =
    people.find((p) => p.id === ownerId)?.name ??
    agent.ownerName ??
    "未指定";

  return (
    <EditPane id={id} label="collab" onSaved={reload}>
      {(ctx) => {
        const handleStart = () => ctx.startEdit();
        const handleSave = async () => {
          const patch = diffDraft(origDraft, draft);
          if (Object.keys(patch).length === 0) {
            ctx.cancelEdit();
            return;
          }
          const ok = await ctx.save(patch);
          if (!ok) setDraft(origDraft);
        };

        return (
          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <section>
              <div className="mb-2 flex justify-end">
                {!ctx.editing ? (
                  <button
                    type="button"
                    onClick={handleStart}
                    className="text-[12px] text-foreground/55 hover:text-foreground"
                  >
                    编辑主理人
                  </button>
                ) : (
                  <EditBar onSave={handleSave} />
                )}
              </div>
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
                <Network className="size-4 text-foreground/45" />
                协作关系图
              </h3>
              <div className="relative rounded-3xl bg-muted/40 p-8 ring-1 ring-border">
                <div className="relative grid place-items-center min-h-[180px]">
                  <div className="col-start-2 row-start-2 flex flex-col items-center gap-2">
                    <AvatarMark glyph={agent.glyph} hue={agent.hue} size="lg" />
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-foreground/55">
                      {agent.displayName} · me
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
                  <User2 className="size-4 text-foreground/45" />
                  主理人 · Owner
                </h3>
                {ctx.editing ? (
                  <EditableSelect
                    label="主理人"
                    field="owner_user_id"
                    value={ownerName}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={[
                      { value: "", label: "— 未指定 —" },
                      ...people.map((p) => ({
                        value: p.id,
                        label: `${p.name} (${p.email.split("@")[0]})`,
                      })),
                    ]}
                  />
                ) : (
                  <ul className="space-y-2">
                    <li className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
                      <span className="text-[13.5px]">{ownerName}</span>
                      <span className="font-mono text-[11px] text-foreground/45">业务所有者</span>
                    </li>
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
                  <Bot className="size-4 text-foreground/45" />
                  与 Bot · Bot network
                </h3>
                <div className="rounded-2xl border border-dashed border-border p-4 text-[13px] text-foreground/55">
                  这位 bot 的上下游关系由 pipeline 配置维护(任务 tab 中可看)。
                </div>
              </div>
            </section>
          </div>
        );
      }}
    </EditPane>
  );
}
