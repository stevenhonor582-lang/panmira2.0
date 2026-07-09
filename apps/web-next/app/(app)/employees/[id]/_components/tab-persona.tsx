"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import {
  EditPane,
  EditableTextarea,
  IronLawsEditor,
  agentToDraft,
  diffDraft,
} from "./edit-mode";

const FIELDS = ["persona", "system_prompt", "iron_laws"];

export function TabPersona({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  React.useEffect(() => {
    if (agent) {
      const d = agentToDraft(agent, FIELDS);
      setDraft(d);
      setOrigDraft(d);
    }
  }, [agent?.id, agent?.updatedAt]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const isDirty = Object.keys(diffDraft(origDraft, draft)).length > 0;

  const onSave = async (ctx: { save: (p: Record<string, unknown>) => Promise<boolean>; cancelEdit: () => void }) => {
    const patch = diffDraft(origDraft, draft);
    if (Object.keys(patch).length === 0) {
      ctx.cancelEdit();
      return;
    }
    const ok = await ctx.save(patch);
    if (!ok) setDraft(origDraft);
  };

  return (
    <EditPane id={id} label="persona" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-6">
            <div>
              <SectionHead icon={BrainCircuit}>人格短句</SectionHead>
              <EditableTextarea
                label="人格短句(60 字内)"
                field="persona"
                value={agent.persona || ""}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                rows={3}
                placeholder="一句话写清这个员工的性格与态度"
              />
            </div>

            <div>
              <SectionHead icon={BrainCircuit}>系统提示词</SectionHead>
              <EditableTextarea
                label="系统提示词"
                field="system_prompt"
                value={agent.systemPrompt || ""}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                rows={14}
                fullscreen
                mono
                placeholder="# 角色\n你是 …\n\n# 工作准则\n1. …"
              />
            </div>
          </section>

          <section>
            <SectionHead icon={ShieldCheck}>铁律</SectionHead>
            <IronLawsEditor
              label="铁律"
              field="iron_laws"
              items={Array.isArray(agent.ironLaws) ? agent.ironLaws : []}
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
            />
          </section>
        </div>
      )}
    </EditPane>
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
    <h3 className="mb-3 mt-1 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
      <Icon className="size-4 text-foreground/45" />
      {children}
    </h3>
  );
}
