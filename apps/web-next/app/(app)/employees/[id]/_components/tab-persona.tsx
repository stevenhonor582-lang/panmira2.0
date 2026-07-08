"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { BrainCircuit, ShieldCheck } from "lucide-react";
import {
  EditPane,
  EditBar,
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

  return (
    <EditPane id={id} label="persona" onSaved={reload}>
      {(ctx) => {
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
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section>
              {ctx.editing ? (
                <>
                  <div className="mb-3 flex justify-end">
                    <EditBar onSave={handleSave} />
                  </div>
                  <EditableTextarea
                    label="Persona · 人格短句(60 字内)"
                    field="persona"
                    value={agent.persona}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    rows={3}
                    placeholder="一句话写清这个员工的性格与态度"
                  />
                  <div className="mt-6">
                    <EditableTextarea
                      label="System Prompt · 完整系统提示词"
                      field="system_prompt"
                      value={agent.systemPrompt}
                      editing
                      draft={draft}
                      setDraft={setDraft}
                      rows={14}
                      fullscreen
                      placeholder="# 角色\n你是 …\n\n# 工作准则\n1. …"
                    />
                  </div>
                </>
              ) : (
                <>
                  <SectionHead icon={BrainCircuit}>Persona · 人格短句</SectionHead>
                  <p className="rounded-2xl bg-card p-6 text-[17px] leading-relaxed ring-1 ring-border">
                    {agent.persona || <span className="text-foreground/40">尚未设置 persona</span>}
                  </p>

                  <SectionHead icon={BrainCircuit}>System Prompt</SectionHead>
                  <pre className="overflow-auto rounded-2xl bg-card p-6 text-[13px] leading-relaxed ring-1 ring-border font-mono whitespace-pre-wrap">
{agent.systemPrompt || <span className="text-foreground/40">尚未设置 system_prompt</span>}
                  </pre>
                </>
              )}
            </section>

            <section>
              <SectionHead icon={ShieldCheck}>五条铁律 · Iron Laws</SectionHead>
              <IronLawsEditor
                label=""
                field="iron_laws"
                items={agent.ironLaws}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
              />
              {ctx.editing && (
                <div className="mt-3 flex justify-end">
                  <EditBar onSave={handleSave} />
                </div>
              )}
            </section>
          </div>
        );
      }}
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
    <h3 className="mb-3 mt-7 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
      <Icon className="size-4 text-foreground/45" />
      {children}
    </h3>
  );
}
