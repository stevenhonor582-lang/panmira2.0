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

              <R15AFields agent={agent} />
            </section>
          </div>
        );
      }}
    </EditPane>
  );
}


/**
 * R15-A 字段区块:working_dir / channel_ids / visibility / temperature / is_template
 * 只读展示。编辑由基础 tab + 后续 R15-B 处理。
 */
function R15AFields({ agent }: { agent: Agent }) {
  const raw = agent.raw as Record<string, unknown> | null;
  const workingDir = (raw?.working_dir as string) || agent.workingDir;
  const channelIds = Array.isArray(raw?.channel_ids)
    ? (raw?.channel_ids as string[])
    : agent.channelIds;
  const visibility = (raw?.visibility as string) || agent.visibility;
  const temperature =
    typeof raw?.temperature === "number" ? (raw.temperature as number) : agent.temperature;
  const isTemplate = Boolean(raw?.is_template) || agent.isTemplate;

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
        R15-A · 多 Bot 字段
      </h3>
      <div className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
        <Row label="工作目录 · working_dir">
          <code className="font-mono text-[12.5px]">
            {workingDir || <span className="text-foreground/40">未设置(默认 /workspace/agents/&lt;id&gt;)</span>}
          </code>
        </Row>
        <Row label="绑定频道 · channel_ids">
          {channelIds.length === 0 ? (
            <span className="text-foreground/40 text-[12.5px]">未绑定</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {channelIds.map((c) => (
                <code key={c} className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px]">
                  {c}
                </code>
              ))}
            </div>
          )}
        </Row>
        <Row label="可见性 · visibility">
          <code className="font-mono text-[12.5px]">{visibility}</code>
        </Row>
        <Row label="温度 · temperature">
          <span className="font-mono text-[12.5px]">{temperature.toFixed(2)}</span>
          <span className="ml-2 text-[11px] text-foreground/45">
            {temperature < 0.3 ? "保守 · 偏确定" : temperature > 0.9 ? "发散 · 偏创造" : "均衡"}
          </span>
        </Row>
        <Row label="类型 · is_template">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono ${
            isTemplate ? "bg-foreground text-background" : "bg-muted text-foreground/70"
          }`}>
            {isTemplate ? "TEMPLATE" : "INSTANCE"}
          </span>
        </Row>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0 last:pb-0">
      <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        {label}
      </span>
      <div className="text-right text-[13px] text-foreground/85">{children}</div>
    </div>
  );
}
