"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { Calendar, Tag, Cpu, GitBranch, User2 } from "lucide-react";
import {
  EditPane,
  EditableText,
  EditableTextarea,
  EditableSelect,
  agentToDraft,
  diffDraft,
} from "./edit-mode";

const ROLE_OPTIONS = [
  { value: "general", label: "通用 · general" },
  { value: "full-stack-engineer", label: "全栈工程师" },
  { value: "copywriting-secretary", label: "文案秘书" },
  { value: "ops-engineer", label: "运维部署" },
  { value: "customer-support", label: "客服一线" },
  { value: "research-analyst", label: "调研分析" },
  { value: "base", label: "base · 派生基底" },
];

const ENGINE_OPTIONS = [
  { value: "claude", label: "Claude (anthropic)" },
  { value: "openai", label: "OpenAI" },
  { value: "glm", label: "智谱 GLM" },
  { value: "minimax", label: "MiniMax" },
];

const COMPLEXITY_OPTIONS = [
  { value: "L1", label: "L1 · 轻量" },
  { value: "L2", label: "L2 · 标准" },
  { value: "L3", label: "L3 · 全栈" },
  { value: "L4", label: "L4 · 自主" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "启用 · active" },
  { value: "paused", label: "暂停 · paused" },
  { value: "deprecated", label: "弃用 · deprecated" },
];

const FIELDS = [
  "name", "description", "role_template", "category",
  "complexity_level", "default_engine", "default_model", "status",
];

// R28-A: Agent 基础信息卡片统一真人 BasicTab 卡片布局
// - 基本信息 卡片(名称/描述/角色/分类)
// - 系统信息 卡片(Agent ID/工作目录/引擎·模型/主理人/模板来源/版本/创建于)
// - 编辑模式: 第二卡片切换为"引擎与模型"编辑表单
export function TabBasics({ id }: { id: string }) {
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

  const categoryValue =
    (agent.raw as Record<string, unknown> | null)?.category ?? "general";

  return (
    <EditPane id={id} label="basics" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => (
        <div className="space-y-4">
          {/* === 基本信息 卡片 === */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">基本信息</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <EditableText
                label="名称"
                field="name"
                value={agent.displayName}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="给员工取个名字"
                hint="display_name 跟随 name"
              />
              {ctx.editing ? (
                <EditableSelect
                  label="角色模板"
                  field="role_template"
                  value={agent.role}
                  editing
                  draft={draft}
                  setDraft={setDraft}
                  options={ROLE_OPTIONS}
                />
              ) : (
                <ReadonlyField label="角色模板" icon={Cpu}>
                  <code className="font-mono text-[13px] tracking-tight">{agent.role}</code>
                </ReadonlyField>
              )}
              {ctx.editing ? (
                <EditableText
                  label="分类"
                  field="category"
                  value={String(categoryValue)}
                  editing
                  draft={draft}
                  setDraft={setDraft}
                  mono
                />
              ) : (
                <ReadonlyField label="分类" icon={Tag}>
                  <code className="font-mono text-[13px]">{String(categoryValue)}</code>
                </ReadonlyField>
              )}
              <div className="md:col-span-2">
                <EditableTextarea
                  label="描述"
                  field="description"
                  value={agent.description || ""}
                  editing={ctx.editing}
                  draft={draft}
                  setDraft={setDraft}
                  placeholder="一句话描述这位员工"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* === 系统信息 / 引擎与模型 卡片 === */}
          <div className="rounded-xl border border-border bg-card p-5">
            {ctx.editing ? (
              <>
                <h3 className="text-sm font-semibold mb-4">引擎与模型</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <EditableSelect
                    label="引擎"
                    field="default_engine"
                    value={agent.defaultEngine}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={ENGINE_OPTIONS}
                  />
                  <EditableText
                    label="模型"
                    field="default_model"
                    value={agent.defaultModel || "—"}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    placeholder="claude-sonnet-4.6 / glm-4.6 / ..."
                    mono
                  />
                  <EditableSelect
                    label="复杂度"
                    field="complexity_level"
                    value={agent.complexityLevel}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={COMPLEXITY_OPTIONS}
                  />
                  <EditableSelect
                    label="状态"
                    field="status"
                    value={agent.status}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={STATUS_OPTIONS}
                  />
                </div>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold mb-4">系统信息</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <ReadonlyField label="Agent ID" icon={Cpu}>
                    <code className="font-mono text-[12.5px]">{agent.id}</code>
                  </ReadonlyField>
                  <ReadonlyField label="工作目录" icon={GitBranch}>
                    <code className="font-mono text-[12.5px] break-all">
                      {agent.workingDir || "—"}
                    </code>
                  </ReadonlyField>
                  <ReadonlyField label="引擎 · 模型" icon={Cpu}>
                    <span className="font-mono text-[12.5px]">
                      {agent.defaultEngine} · {agent.defaultModel || "默认"}
                    </span>
                  </ReadonlyField>
                  <ReadonlyField label="复杂度" icon={Tag}>
                    <span className="font-mono">{agent.complexityLevel}</span>
                  </ReadonlyField>
                  <ReadonlyField label="主理人" icon={User2}>
                    <span className="font-medium">{agent.ownerName}</span>
                  </ReadonlyField>
                  <ReadonlyField label="模板来源" icon={GitBranch}>
                    {agent.templateSource ? (
                      <span className="font-mono text-[12.5px]">
                        {String(agent.templateSource).slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-foreground/50">原创</span>
                    )}
                  </ReadonlyField>
                  <ReadonlyField label="版本" icon={Tag}>
                    <span className="font-mono">v{agent.version}</span>
                  </ReadonlyField>
                  <ReadonlyField label="创建于" icon={Calendar}>
                    <span className="font-mono text-[12.5px]">
                      {new Date(agent.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </ReadonlyField>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </EditPane>
  );
}

// ReadonlyField: BasicTab 同款 label 风格(小字大写 + value text-sm)
function ReadonlyField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div className="text-sm text-foreground/85">{children}</div>
    </div>
  );
}
