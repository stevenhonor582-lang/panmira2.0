"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { Wrench, Plug, Terminal, BookOpen } from "lucide-react";
import {
  EditPane,
  EditBar,
  ChipListEditor,
  agentToDraft,
  diffDraft,
} from "./edit-mode";

const FIELDS = ["capabilities", "tools", "skills", "knowledge_folders"];

export function TabSkills({ id }: { id: string }) {
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
    <EditPane id={id} label="skills" onSaved={reload}>
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
          <div className="space-y-6">
            {ctx.editing && (
              <div className="flex justify-end">
                <EditBar onSave={handleSave} />
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <ChipListEditor
                label="能力 · capabilities"
                field="capabilities"
                items={agent.skills}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="如: seo-writing / code-review / data-analysis"
              />
              <ChipListEditor
                label="技能 · skills (skill 命名空间)"
                field="skills"
                items={
                  Array.isArray((agent.raw as any)?.skills)
                    ? (agent.raw as any).skills
                    : []
                }
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="如: superpowers:tdd / gstack:react"
              />
              <ChipListEditor
                label="工具 · tools"
                field="tools"
                items={agent.tools}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="如: web_search / shell / file_read"
              />
              <ChipListEditor
                label="知识文件夹 · knowledge_folders"
                field="knowledge_folders"
                items={agent.knowledgeFolders}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="如: kb-product / kb-sales"
              />
            </div>
            {ctx.editing && (
              <div className="flex justify-end">
                <EditBar onSave={handleSave} />
              </div>
            )}
          </div>
        );
      }}
    </EditPane>
  );
}
