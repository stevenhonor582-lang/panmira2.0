"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import { Info, ShieldCheck, Lock, FolderOpen, Globe2 } from "lucide-react";
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
 * R28-C: 技能 tab — 删 capabilities,只留 skills(带描述)/ tools / knowledge_folders。
 *
 * ⑦ 知识库:公共 / 该 Agent 专属 两区,权限隔离(其他 Agent 专属不出现)。
 * ⑧ 工具:分自动工具(系统默认,不显示)与手动勾选工具(额外,pipeline 只调勾选的)。
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

// ── ⑧ 工具目录:自动(系统默认) vs 手动(额外勾选) ─────────────────────────────
// 自动工具:只读 / 低风险,所有 agent 默认就有,pipeline 永远可调,不在勾选列表出现。
const DEFAULT_TOOL_IDS = new Set([
  "web_search",   // 联网搜索
  "web_fetch",    // 抓取 URL
  "file_read",    // 读文件
  "kv_memory",    // 短期记忆
  "task_plan",    // 任务拆解
]);

// 手动勾选工具:高风险 / 副作用强 / 需权限,pipeline 只在勾选时才可调用。
// 在 BUILT_IN_TOOLS 基础上补 db_query(高风险,显式启用)。
const EXTRA_TOOLS: { id: string; label: string; description: string }[] = [
  ...BUILT_IN_TOOLS.filter((t) => !DEFAULT_TOOL_IDS.has(t.id)),
  { id: "db_query", label: "DB Query", description: "查询数据库(只读 SQL,需权限)" },
];

const DEFAULT_TOOL_ITEMS = BUILT_IN_TOOLS.filter((t) => DEFAULT_TOOL_IDS.has(t.id));

const EXTRA_TOOL_ITEMS: ResourceItem[] = EXTRA_TOOLS.map((t) => ({
  id: t.id,
  label: t.label,
  description: t.description,
}));

interface RawFolder {
  id: string;
  name: string;
  path?: string;
  visibility?: string;
  botId?: string | null;
  docCount?: number;
}

export function TabSkills({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  // R25: 拉真实 skill / KB folder 列表,供"从库选"
  const [skillItems, setSkillItems] = React.useState<ResourceItem[]>([]);
  const [folderItems, setFolderItems] = React.useState<RawFolder[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setPickerLoading(true);
    Promise.all([
      api<{ skills: { id: string; name: string; description?: string }[] } | { id: string; name: string; description?: string }[]>("/api/skills").catch(() => null),
      api<{ folders: RawFolder[] } | RawFolder[]>("/api/knowledge/folders").catch(() => null),
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
          name: f.name ?? f.id,
          path: f.path,
          visibility: f.visibility,
          botId: f.botId ?? null,
          docCount: f.docCount ?? 0,
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

  // 该 Agent 当前选中的"额外工具"(自动工具不算在 agent.tools 里,恒为默认启用)
  const agentExtraTools: string[] = (agent.tools ?? []).filter((t) => !DEFAULT_TOOL_IDS.has(t));

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

            {/* ⑧ 工具:自动(默认) + 手动(额外勾选) */}
            <ToolsEditor
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              agentExtraTools={agentExtraTools}
            />

            {/* ⑦ 知识库:公共 / 该 Agent 专属 两区 + 权限隔离 */}
            <KnowledgeFoldersEditor
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              selectedFolders={agent.knowledgeFolders ?? []}
              folderItems={folderItems}
              agentBotIds={agent.channelIds ?? []}
              loading={pickerLoading}
            />
          </div>
        </div>
      )}
    </EditPane>
  );
}

// ── ⑧ 工具编辑器 ────────────────────────────────────────────────────────────

function ToolsEditor({
  editing,
  draft,
  setDraft,
  agentExtraTools,
}: {
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  agentExtraTools: string[];
}) {
  return (
    <div className="space-y-3">
      {/* 自动工具(系统默认,只读) */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
          <ShieldCheck className="size-3.5 text-emerald-500/70" />
          工具 · 默认已启用
          <span className="font-mono text-[11px] text-foreground/40">{DEFAULT_TOOL_ITEMS.length} 项</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_TOOL_ITEMS.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11.5px] text-emerald-700/80 ring-1 ring-emerald-500/20 dark:text-emerald-300/80"
              title={t.description}
            >
              <code className="font-mono">{t.id}</code>
              <span className="font-sans opacity-70">{t.label}</span>
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-foreground/45">
          所有 Agent 默认含基础工具,pipeline 永远可调用,无需勾选。
        </p>
      </div>

      {/* 手动勾选工具(额外,高风险) */}
      <div>
        <ChipListEditor
          label="工具 · 额外(需手动启用)"
          field="tools"
          items={agentExtraTools}
          editing={editing}
          draft={draft}
          setDraft={setDraft}
          placeholder="如: file_write / code_execute / db_query"
          pickerConfig={{
            title: "选择额外工具(高风险)",
            items: EXTRA_TOOL_ITEMS,
            loading: false,
            placeholder: "搜索工具…",
          }}
        />
        <p className="mt-1.5 text-[11px] text-foreground/45">
          这里勾选的是<strong className="text-foreground/60">额外工具</strong>(写文件 / 执行代码 / 查库等高风险)。
          <strong className="text-foreground/60">只有勾选的工具才会在 pipeline 执行时可调用</strong>,没勾的不能。
        </p>
      </div>
    </div>
  );
}

// ── ⑦ 知识库编辑器:公共 / 专属 两区 + 权限隔离 ────────────────────────────────

function KnowledgeFoldersEditor({
  editing,
  draft,
  setDraft,
  selectedFolders,
  folderItems,
  agentBotIds,
  loading,
}: {
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  selectedFolders: string[];
  folderItems: RawFolder[];
  agentBotIds: string[];
  loading: boolean;
}) {
  const agentBotSet = React.useMemo(() => new Set(agentBotIds), [agentBotIds]);

  // 当前生效的选择列表(editing 用 draft,只读用 agent 原值)
  const currentList: string[] = editing
    ? Array.isArray(draft.knowledge_folders) ? (draft.knowledge_folders as string[]) : selectedFolders
    : selectedFolders;
  const selectedKey = currentList.slice().sort().join("|");
  const selectedSet = React.useMemo(() => new Set(currentList), [selectedKey]);

  const { publicFolders, ownFolders, hiddenCount } = React.useMemo(() => {
    const pub: RawFolder[] = [];
    const own: RawFolder[] = [];
    let hidden = 0;
    for (const f of folderItems) {
      const isPublic = !f.botId; // 公共:无归属 bot
      const isOwn = !!f.botId && agentBotSet.has(f.botId);
      if (isPublic) pub.push(f);
      else if (isOwn) own.push(f);
      else hidden++; // 其他 Agent 专属 — 不在选择列表
    }
    return { publicFolders: pub, ownFolders: own, hiddenCount: hidden };
  }, [folderItems, agentBotSet]);

  const toggle = (folderId: string) => {
    const next = selectedSet.has(folderId)
      ? currentList.filter((x) => x !== folderId)
      : [...currentList, folderId];
    setDraft({ ...draft, knowledge_folders: next });
  };

  const renderGroup = (
    title: string,
    icon: React.ReactNode,
    folders: RawFolder[],
    emptyHint: string,
  ) => (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
        {icon}
        {title}
        <span className="font-mono text-[11px] text-foreground/40">{folders.length} 个</span>
      </div>
      {loading ? (
        <p className="text-[11.5px] text-foreground/40">加载中…</p>
      ) : folders.length === 0 ? (
        <p className="text-[11.5px] text-foreground/45">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {folders.map((f) => {
            const checked = selectedSet.has(f.id);
            return (
              <li key={f.id}>
                <label
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors ${
                    editing ? "cursor-pointer hover:bg-muted/50" : "cursor-default opacity-90"
                  } ${checked ? "ring-1 ring-foreground/15 bg-muted/30" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!editing}
                    onChange={() => editing && toggle(f.id)}
                    className="mt-0.5 size-3.5 accent-foreground/70"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground/80">{f.name}</span>
                    {f.path && (
                      <span className="block truncate font-mono text-[10.5px] text-foreground/40">{f.path}</span>
                    )}
                  </span>
                  {f.docCount !== undefined && f.docCount > 0 && (
                    <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">{f.docCount} 文档</span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
        <FolderOpen className="size-3.5 text-foreground/45" />
        知识库 · knowledge_folders
        <span className="font-mono text-[11px] text-foreground/40">{currentList.length} 已选</span>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-3 py-2.5 text-[11.5px] text-foreground/55">
        <p>
          知识库分两区:<strong className="text-foreground/70">公共</strong>(团队/公司共享) +
          <strong className="text-foreground/70"> 该 Agent 专属</strong>。
          <span className="text-foreground/45">其他 Agent 的专属知识库不在此列(权限隔离)。</span>
        </p>
        {hiddenCount > 0 && (
          <p className="mt-1 text-[11px] text-foreground/45">
            <Lock className="mr-1 inline size-3 align-text-bottom" />
            另有 {hiddenCount} 个为其他 Agent 专属,已隐藏。
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {renderGroup(
          "公共知识库",
          <Globe2 className="size-3.5 text-sky-500/70" />,
          publicFolders,
          "暂无公共知识库。",
        )}
        {renderGroup(
          "该 Agent 专属",
          <Lock className="size-3.5 text-amber-500/70" />,
          ownFolders,
          agentBotIds.length === 0
            ? "该 Agent 未绑定 bot,暂无专属知识库。"
            : "暂无专属知识库。",
        )}
      </div>
    </div>
  );
}
