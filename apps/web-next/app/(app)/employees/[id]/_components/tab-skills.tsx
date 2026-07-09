"use client";

import * as React from "react";
import { useAgent } from "../../_lib/data";
import {
  Info,
  ShieldCheck,
  Lock,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FolderTree,
  FileText,
  AlertCircle,
} from "lucide-react";
import {
  EditPane,
  agentToDraft,
  diffDraft,
} from "./edit-mode";
import { SkillCardGrid, type CardData } from "./skill-card-grid";
import { ResourcePicker } from "@/components/resource-picker/resource-picker";
import type { ResourceItem } from "@/components/resource-picker/resource-picker";
import { api } from "@/lib/api";
import { BUILT_IN_TOOLS } from "../../new/_components/form";

/**
 * R31-B: 技能 tab — 两处重构
 *
 * ⑦ 知识库:两级层级选择器(只显示组织公共区,过滤数字员工个人库/群组协作库)
 *    - 通过根目录名定位"组织公共区",展开其一级、二级子目录
 *    - 三级以下不展示
 *    - 多选(checkbox)
 *
 * ⑧ 技能 / 工具:块状紧凑网格,每张卡片含 ID + 中文短描述 + 功能说明
 *    - 替代 ChipListEditor 长条逐条罗列
 */

const FIELDS = ["tools", "skills", "knowledge_folders"];

// ── 技能元信息:中文短描述(title) + 功能说明(purpose) ─────────────────────────
// title 粗体显示在 ID 下方;purpose 灰色小字显示在 title 下方。
// 没映射到的,回退显示 ID 本身(无 title/purpose)。
const SKILL_META: Record<string, { title: string; purpose: string }> = {
  // ── superpowers 系列 ──
  "superpowers:brainstorming": { title: "头脑风暴", purpose: "发散思考,产生创意清单" },
  "superpowers:writing-plans": { title: "写计划", purpose: "结构化拆解任务,产出步骤清单" },
  "superpowers:executing-plans": { title: "执行计划", purpose: "按步骤推进,逐项收口" },
  "superpowers:test-driven-development": { title: "TDD", purpose: "测试驱动开发,红→绿→重构" },
  "superpowers:systematic-debugging": { title: "系统调试", purpose: "根因分析,五问到底" },
  "superpowers:requesting-code-review": { title: "请求代码评审", purpose: "主动发起代码审查" },
  "superpowers:receiving-code-review": { title: "接收评审反馈", purpose: "正确接收并响应反馈" },
  "superpowers:verification-before-completion": { title: "完成前验证", purpose: "收口前查漏,不放过遗漏" },
  "superpowers:finishing-a-development-branch": { title: "收尾分支", purpose: "合并前清理,准备 PR" },
  "superpowers:using-git-worktrees": { title: "Git 工作树", purpose: "隔离开发,多分支并行" },
  "superpowers:using-superpowers": { title: "元技能调度", purpose: "调用其他技能的中枢" },
  "superpowers:dispatching-parallel-agents": { title: "并行代理", purpose: "多 agent 并发协作" },
  "superpowers:subagent-driven-development": { title: "子代理开发", purpose: "委派任务给子 agent" },
  "superpowers:writing-skills": { title: "写技能", purpose: "创建新的可复用技能" },
  // ── gstack 系列 ──
  "gstack:review": { title: "代码审查", purpose: "评审代码质量与正确性" },
  "gstack:ship": { title: "发布", purpose: "上线部署,灰度推进" },
  "gstack:investigate": { title: "调研", purpose: "深挖问题根因与方案" },
  "gstack:spec": { title: "写规格", purpose: "产出需求/规格文档" },
  "gstack:document-generate": { title: "文档生成", purpose: "自动产出技术文档" },
  // ── 其他常见 ──
  "web-research": { title: "网络调研", purpose: "多源检索,交叉验证" },
  "code-review": { title: "代码审查", purpose: "审查代码质量" },
  "seo-writing": { title: "SEO 写作", purpose: "按关键词产出优化内容" },
  "data-analysis": { title: "数据分析", purpose: "统计建模与可视化" },
};

/** 把 string[] 解析成 CardData[]:从元信息表查 title/purpose,缺省回退。 */
function resolveSkillCards(ids: string[]): CardData[] {
  return ids.map((id) => {
    const meta = SKILL_META[id];
    return {
      id,
      rawId: id,
      title: meta?.title ?? id,
      purpose: meta?.purpose ?? "",
    };
  });
}

// ── 工具目录:自动(系统默认,只读) vs 手动(额外勾选) ──────────────────────────
const DEFAULT_TOOL_IDS = new Set([
  "web_search",   // 联网搜索
  "web_fetch",    // 抓取 URL
  "file_read",    // 读文件
  "kv_memory",    // 短期记忆
  "task_plan",    // 任务拆解
]);

// 额外工具元信息:复用 BUILT_IN_TOOLS 的 description,补 db_query。
const EXTRA_TOOLS_META: { id: string; label: string; description: string }[] = [
  ...BUILT_IN_TOOLS.filter((t) => !DEFAULT_TOOL_IDS.has(t.id)),
  { id: "db_query", label: "DB Query", description: "查询数据库(只读 SQL,需权限)" },
];

const DEFAULT_TOOL_ITEMS = BUILT_IN_TOOLS.filter((t) => DEFAULT_TOOL_IDS.has(t.id));

const EXTRA_TOOL_ITEMS: ResourceItem[] = EXTRA_TOOLS_META.map((t) => ({
  id: t.id,
  label: t.label,
  description: t.description,
}));

/** 工具 CardData 解析(BUILT_IN_TOOLS 提供 label + description) */
function resolveToolCards(ids: string[]): CardData[] {
  return ids.map((id) => {
    const meta = EXTRA_TOOLS_META.find((t) => t.id === id);
    return {
      id,
      rawId: id,
      title: meta?.label ?? id,
      purpose: meta?.description ?? "",
    };
  });
}

// ── 知识库 folders 数据形态 ─────────────────────────────────────────────────

interface RawFolder {
  id: string;
  parentId?: string | null;
  name: string;
  path?: string;
  visibility?: string;
  botId?: string | null;
  docCount?: number;
}

/** 应当过滤掉的根目录名(数字员工个人库 / 群组协作库 / Root 系统占位)。 */
const BLACKLIST_ROOT_NAMES = ["数字员工", "群协作区", "群组协作", "Root", "root"];

/** 公共知识区根目录名(主匹配)。 */
const PUBLIC_ROOT_NAMES = ["组织公共区", "公共知识区", "公共区"];

/** 还要补一刀 visibility 过滤(防数据未来加 private/group 标记)。 */
function isPublicFolder(f: RawFolder): boolean {
  const v = (f.visibility || "").toLowerCase();
  return v !== "private" && v !== "group";
}

export function TabSkills({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

  // R25: 拉 skill / KB folder 列表
  const [skillItems, setSkillItems] = React.useState<ResourceItem[]>([]);
  const [folderItems, setFolderItems] = React.useState<RawFolder[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);

  // R31-B: skill picker 开关
  const [skillPickerOpen, setSkillPickerOpen] = React.useState(false);

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
          parentId: f.parentId ?? f.parent_id ?? null,
          name: f.name ?? f.id,
          path: f.path,
          visibility: f.visibility,
          botId: f.botId ?? f.bot_id ?? null,
          docCount: f.docCount ?? f.doc_count ?? 0,
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
  const agentExtraTools: string[] = (agent.tools ?? []).filter((t) => !DEFAULT_TOOL_IDS.has(t));

  return (
    <EditPane id={id} label="skills" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => {
        // 编辑态用 draft,只读用 agent 原值
        const draftSkills: string[] = ctx.editing && Array.isArray(draft.skills)
          ? (draft.skills as string[])
          : skillsList;
        const draftTools: string[] = ctx.editing && Array.isArray(draft.tools)
          ? (draft.tools as string[])
          : agentExtraTools;
        const draftFolders: string[] = ctx.editing && Array.isArray(draft.knowledge_folders)
          ? (draft.knowledge_folders as string[])
          : (agent.knowledgeFolders ?? []);

        return (
          <div className="space-y-6">
            {/* 系统默认提示 */}
            <div className="flex items-start gap-2 rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-[12.5px] text-foreground/55">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <p>
                系统默认已含基础能力(对话 / 记忆 / SDK),这里配置的是<strong className="text-foreground/70">额外技能</strong>。
                技能用命名空间格式(如 <code className="font-mono">superpowers:brainstorming</code>)。
              </p>
            </div>

            {/* ─── 技能:块状网格 ─── */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
                <ShieldCheck className="size-3.5 text-violet-500/70" />
                技能 · skills
                <span className="font-mono text-[11px] text-foreground/40">{draftSkills.length} 项</span>
              </div>
              <SkillCardGrid
                cards={resolveSkillCards(draftSkills)}
                editing={ctx.editing}
                onRemove={(sid) =>
                  setDraft({ ...draft, skills: draftSkills.filter((x) => x !== sid) })
                }
                onAddClick={() => setSkillPickerOpen(true)}
                addLabel="添加技能"
                emptyHint="尚未配置技能,编辑后可从库选或手动添加。"
              />
              <ResourcePicker
                open={skillPickerOpen}
                onOpenChange={setSkillPickerOpen}
                title="选择技能"
                items={skillItems}
                selectedIds={draftSkills}
                loading={pickerLoading}
                multi
                placeholder="搜索技能名或描述…"
                onConfirm={(picked) => {
                  const ids = picked.map((p) => p.id);
                  const merged = Array.from(new Set([...draftSkills, ...ids]));
                  setDraft({ ...draft, skills: merged });
                }}
              />
            </div>

            {/* ─── 工具:默认(只读) + 额外(块状网格) ─── */}
            <ToolsEditor
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              agentExtraTools={draftTools}
            />

            {/* ─── 知识库:两级层级选择器 ─── */}
            <KnowledgeFoldersEditor
              editing={ctx.editing}
              draft={draft}
              setDraft={setDraft}
              selectedFolders={draftFolders}
              folderItems={folderItems}
              loading={pickerLoading}
            />
          </div>
        );
      }}
    </EditPane>
  );
}

// ── 工具编辑器:默认工具(只读 chip) + 额外工具(块状网格) ─────────────────────

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
  const [toolPickerOpen, setToolPickerOpen] = React.useState(false);

  return (
    <div className="space-y-3">
      {/* 默认工具(系统默认,只读 chip) */}
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

      {/* 额外工具(高风险,块状网格勾选) */}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
          <ShieldCheck className="size-3.5 text-amber-500/70" />
          工具 · 额外(需手动启用)
          <span className="font-mono text-[11px] text-foreground/40">{agentExtraTools.length} 项</span>
        </div>
        <SkillCardGrid
          cards={resolveToolCards(agentExtraTools)}
          editing={editing}
          onRemove={(tid) =>
            setDraft({ ...draft, tools: agentExtraTools.filter((x) => x !== tid) })
          }
          onAddClick={() => setToolPickerOpen(true)}
          addLabel="添加工具"
          emptyHint="尚未启用额外工具(写文件 / 执行代码 / 查库等高风险)。"
        />
        <p className="mt-1.5 text-[11px] text-foreground/45">
          <strong className="text-foreground/60">只有勾选的工具才会被 pipeline 调用</strong>,未勾的不可用。
        </p>

        <ResourcePicker
          open={toolPickerOpen}
          onOpenChange={setToolPickerOpen}
          title="选择额外工具(高风险)"
          items={EXTRA_TOOL_ITEMS}
          selectedIds={agentExtraTools}
          multi
          placeholder="搜索工具…"
          onConfirm={(picked) => {
            const ids = picked.map((p) => p.id);
            const merged = Array.from(new Set([...agentExtraTools, ...ids]));
            setDraft({ ...draft, tools: merged });
          }}
        />
      </div>
    </div>
  );
}

// ── 知识库:两级层级选择器(只显示组织公共区) ────────────────────────────────

interface TreeNode extends RawFolder {
  children: TreeNode[];
}

function KnowledgeFoldersEditor({
  editing,
  draft,
  setDraft,
  selectedFolders,
  folderItems,
  loading,
}: {
  editing: boolean;
  draft: Record<string, unknown>;
  setDraft: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  selectedFolders: string[];
  folderItems: RawFolder[];
  loading: boolean;
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  // 当前生效选择列表
  const selectedKey = selectedFolders.slice().sort().join("|");
  const selectedSet = React.useMemo(() => new Set(selectedFolders), [selectedKey]);

  // 1. 定位"组织公共区"根目录(按名匹配)
  const publicRoot = React.useMemo(() => {
    return folderItems.find(
      (f) =>
        (!f.parentId || f.parentId === "root") &&
        PUBLIC_ROOT_NAMES.some((n) => f.name.includes(n)),
    );
  }, [folderItems]);

  // 2. 构两级树:一级 = 公共根的子目录;二级 = 一级的子目录
  const tree = React.useMemo<TreeNode[]>(() => {
    // 先按 visibility 过滤(防御性,未来数据可能加标记)
    const visible = folderItems.filter(isPublicFolder);
    const byParent = new Map<string, RawFolder[]>();
    for (const f of visible) {
      const k = f.parentId ?? "(root)";
      const arr = byParent.get(k) ?? [];
      arr.push(f);
      byParent.set(k, arr);
    }

    // 主路径:有"组织公共区"根 → 取其子节点为一级
    if (publicRoot) {
      const l1s = byParent.get(publicRoot.id) ?? [];
      return l1s
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"))
        .map<TreeNode>((l1) => ({
          ...l1,
          children: (byParent.get(l1.id) ?? [])
            .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"))
            .map<TreeNode>((l2) => ({ ...l2, children: [] })),
        }));
    }

    // 回退路径:无公共根 → 取顶层中未黑名单的目录为一级(防御性)
    const roots = visible.filter(
      (f) =>
        (!f.parentId || f.parentId === "root") &&
        !BLACKLIST_ROOT_NAMES.some((n) => f.name.includes(n)),
    );
    return roots
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"))
      .map<TreeNode>((l1) => ({
        ...l1,
        children: (byParent.get(l1.id) ?? [])
          .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans"))
          .map<TreeNode>((l2) => ({ ...l2, children: [] })),
      }));
  }, [folderItems, publicRoot]);

  // 已选但被过滤掉的孤儿(用户之前的私人/群组选择,UI 不显示但数据仍在)
  const visibleIds = React.useMemo(() => {
    const s = new Set<string>();
    for (const l1 of tree) {
      s.add(l1.id);
      for (const l2 of l1.children) s.add(l2.id);
    }
    return s;
  }, [tree]);
  const orphanCount = selectedFolders.filter((sid) => !visibleIds.has(sid)).length;

  const toggle = (folderId: string) => {
    const next = selectedSet.has(folderId)
      ? selectedFolders.filter((x) => x !== folderId)
      : [...selectedFolders, folderId];
    setDraft({ ...draft, knowledge_folders: next });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 默认展开所有一级(有子目录的)首次渲染时
  React.useEffect(() => {
    if (expanded.size === 0 && tree.length > 0) {
      const toExpand = new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id));
      if (toExpand.size > 0) setExpanded(toExpand);
    }
  }, [tree, expanded.size]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
        <FolderTree className="size-3.5 text-sky-500/70" />
        知识库 · 公共知识区(两级)
        <span className="font-mono text-[11px] text-foreground/40">{selectedFolders.length} 已选</span>
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-muted/15 px-3 py-2.5 text-[11.5px] text-foreground/55">
        <p>
          只显示 <strong className="text-foreground/70">组织公共区</strong> 知识库(两级层级)。
          <span className="text-foreground/45">
            数字员工个人库、群组协作库已自动隐藏。点一级展开二级,最多到二级。
          </span>
        </p>
        {orphanCount > 0 && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-foreground/45">
            <AlertCircle className="size-3" />
            另有 {orphanCount} 个已选库不在公共区(被过滤),保存时仍会保留但建议取消选择。
          </p>
        )}
      </div>

      {loading ? (
        <p className="text-[11.5px] text-foreground/40">加载中…</p>
      ) : tree.length === 0 ? (
        <p className="text-[11.5px] text-foreground/45">
          暂无可选公共知识库。
        </p>
      ) : (
        <ul className="space-y-0.5 rounded-xl border border-border/60 bg-card/40 p-2">
          {tree.map((l1) => {
            const checked1 = selectedSet.has(l1.id);
            const isOpen = expanded.has(l1.id);
            const hasChildren = l1.children.length > 0;
            return (
              <li key={l1.id}>
                {/* 一级 */}
                <label
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[12px] transition-colors ${
                    editing ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                  } ${checked1 ? "bg-muted/40 ring-1 ring-foreground/10" : ""}`}
                >
                  {/* 展开按钮 */}
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        toggleExpand(l1.id);
                      }}
                      className="grid size-4 place-items-center rounded text-foreground/50 hover:bg-foreground/10"
                      aria-label={isOpen ? "收起" : "展开"}
                    >
                      {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                    </button>
                  ) : (
                    <span className="inline-block size-4" />
                  )}
                  <FolderOpen className="size-3.5 shrink-0 text-amber-500/70" />
                  <input
                    type="checkbox"
                    checked={checked1}
                    disabled={!editing}
                    onChange={() => editing && toggle(l1.id)}
                    className="size-3.5 accent-foreground/70"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">{l1.name}</span>
                  {l1.docCount !== undefined && l1.docCount > 0 && (
                    <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">
                      {l1.docCount} 文档
                    </span>
                  )}
                </label>

                {/* 二级(展开时) */}
                {hasChildren && isOpen && (
                  <ul className="ml-7 mt-0.5 space-y-0.5 border-l border-border/60 pl-2.5">
                    {l1.children.map((l2) => {
                      const checked2 = selectedSet.has(l2.id);
                      return (
                        <li key={l2.id}>
                          <label
                            className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors ${
                              editing ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                            } ${checked2 ? "bg-muted/40 ring-1 ring-foreground/10" : ""}`}
                          >
                            <FileText className="size-3 shrink-0 text-foreground/45" />
                            <input
                              type="checkbox"
                              checked={checked2}
                              disabled={!editing}
                              onChange={() => editing && toggle(l2.id)}
                              className="size-3.5 accent-foreground/70"
                            />
                            <span className="min-w-0 flex-1 truncate text-foreground/75">{l2.name}</span>
                            {l2.docCount !== undefined && l2.docCount > 0 && (
                              <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">
                                {l2.docCount} 文档
                              </span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* 锁图标提示 — 移除原"该 Agent 专属"区,保持简洁 */}
      <p className="flex items-center gap-1 text-[11px] text-foreground/45">
        <Lock className="size-3" />
        个人 / 群组知识库不在选择范围(权限隔离)。
      </p>
    </div>
  );
}
