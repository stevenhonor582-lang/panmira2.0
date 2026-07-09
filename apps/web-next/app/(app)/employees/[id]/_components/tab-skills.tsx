"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { Info } from "lucide-react";
import {
  EditPane,
  ChipListEditor,
  agentToDraft,
  diffDraft,
} from "./edit-mode";
import { api } from "@/lib/api";
import { BUILT_IN_TOOLS } from "../../new/_components/form";
import type { ResourceItem } from "@/components/resource-picker/resource-picker";

/**
 * R24: 技能 tab — 删 capabilities,只留 skills(带描述)/ tools / knowledge_folders。
 * skills 是命名空间引用(如 superpowers:brainstorming),描述从内置映射推导。
 */

const FIELDS = ["tools", "skills", "knowledge_folders"];

/** 常用 skill 的中文描述映射。没映射的显示 skill_id 本身。 */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  // superpowers
  "superpowers:brainstorming": "头脑风暴 · 发散思考产生创意",
  "superpowers:writing-plans": "写计划 · 结构化任务拆解",
  "superpowers:executing-plans": "执行计划 · 按步骤推进",
  "superpowers:test-driven-development": "TDD · 测试驱动开发",
  "superpowers:systematic-debugging": "系统调试 · 根因分析",
  "superpowers:requesting-code-review": "代码评审 · 请求审查",
  "superpowers:receiving-code-review": "代码评审 · 接收反馈",
  "superpowers:verification-before-completion": "完成前验证 · 不放过遗漏",
  "superpowers:finishing-a-development-branch": "收尾分支 · 合并前清理",
  "superpowers:using-git-worktrees": "Git 工作树 · 隔离开发",
  "superpowers:using-superpowers": "元技能 · 调用其他技能",
  "superpowers:dispatching-parallel-agents": "并行代理 · 多 agent 协作",
  "superpowers:subagent-driven-development": "子代理开发 · 委派任务",
  "superpowers:writing-skills": "写技能 · 创建新技能",
  // gstack
  "gstack:review": "代码审查",
  "gstack:ship": "发布 · 上线部署",
  "gstack:investigate": "调研 · 深挖问题",
  "gstack:spec": "规格 · 写需求文档",
  "gstack:document-generate": "文档生成",
  // 其他常见
  "web-research": "网络调研 · 多源检索",
  "code-review": "代码审查",
  "seo-writing": "SEO 写作",
  "data-analysis": "数据分析",
};

function describeSkill(skillId: string): string {
  return SKILL_DESCRIPTIONS[skillId] ?? skillId;
}

// R25: 内置工具目录(从 form.ts 复用),给 ChipListEditor 的 pickerConfig 用
const TOOL_ITEMS: ResourceItem[] = BUILT_IN_TOOLS.map((t) => ({
  id: t.id,
  label: t.label,
  description: t.description,
}));

export function TabSkills({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  // R25: 拉真实 skill / KB folder 列表,供"从库选"
  const [skillItems, setSkillItems] = React.useState<ResourceItem[]>([]);
  const [folderItems, setFolderItems] = React.useState<ResourceItem[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setPickerLoading(true);
    Promise.all([
      api<{ skills: { id: string; name: string; description?: string }[] } | { id: string; name: string; description?: string }[]>("/api/skills").catch(() => null),
      api<{ folders: { id: string; name: string; path?: string; docCount?: number }[] } | { id: string; name: string; path?: string; docCount?: number }[]>("/api/knowledge/folders").catch(() => null),
    ]).then(([skillRes, folderRes]) => {
      if (!alive) return;
      const sRaw = (skillRes as any)?.skills ?? (Array.isArray(skillRes) ? skillRes : []);
      const fRaw = (folderRes as any)?.folders ?? (Array.isArray(folderRes) ? folderRes : []);
      setSkillItems(
        (sRaw as any[]).map((s) => ({
          id: s.id ?? s.name,
          label: s.name ?? s.id,
          description: s.description,
        })),
      );
      setFolderItems(
        (fRaw as any[]).map((f) => ({
          id: f.id ?? f.name,
          label: f.name ?? f.id,
          description: f.path ? `路径 · ${f.path}` : undefined,
        })),
      );
    }).finally(() => {
      if (alive) setPickerLoading(false);
    });
    return () => { alive = false; };
  }, []);

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

  const skillsList: string[] = Array.isArray((agent.raw as any)?.skills)
    ? (agent.raw as any).skills
    : [];

  return (
    <EditPane id={id} label="skills" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => (
        <div className="space-y-6">
          {/* 系统默认提示 */}
          <div className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[12.5px] text-foreground/55">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <p>
              系统默认已含基础能力(对话 / 记忆 / SDK),这里配置的是<strong className="text-foreground/70">额外技能</strong>。
              技能用命名空间格式(如 <code className="font-mono">superpowers:brainstorming</code>)。
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* 技能 skills — 带描述 */}
            <div className="lg:col-span-2">
              <ChipListEditor
                label="技能 · skills"
                field="skills"
                items={skillsList}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="如: superpowers:brainstorming / gstack:review"
                renderItem={(item) => (
                  <span className="flex items-baseline gap-1.5">
                    <code className="font-mono text-[12px]">{item}</code>
                    {!ctx.editing && describeSkill(item) !== item && (
                      <span className="font-sans text-[11px] text-foreground/45">
                        {describeSkill(item)}
                      </span>
                    )}
                  </span>
                )}
                pickerConfig={{
                  title: "选择技能",
                  items: skillItems,
                  loading: pickerLoading,
                  placeholder: "搜索技能名或描述…",
                }}
              />
              {!ctx.editing && skillsList.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {skillsList.map((s) => {
                    const desc = describeSkill(s);
                    if (desc === s) return null;
                    return (
                      <li key={s} className="flex gap-2 text-[12px] text-foreground/55">
                        <code className="font-mono text-foreground/70">{s}</code>
                        <span>→ {desc}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <ChipListEditor
              label="工具 · tools"
              field="tools"
              items={agent.tools}
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              placeholder="如: web_search / shell / file_read"
              pickerConfig={{
                title: "选择工具",
                items: TOOL_ITEMS,
                loading: false,
                placeholder: "搜索工具…",
              }}
            />

            <ChipListEditor
              label="知识库 · knowledge_folders"
              field="knowledge_folders"
              items={agent.knowledgeFolders}
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              placeholder="如: kb-product / kb-sales"
              pickerConfig={{
                title: "选择知识库文件夹",
                items: folderItems,
                loading: pickerLoading,
                placeholder: "搜索文件夹…",
              }}
            />
          </div>
        </div>
      )}
    </EditPane>
  );
}
