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

// ── 知识库:单一入口 + 弹窗加载两级目录(R32-C) ─────────────────────────────
//
// R32-C 改动 ⑨:页面只保留"组织公共知识区"单一入口(不直接罗列目录);
//               点击"添加知识库"按钮才弹窗加载两级目录。
// R32-C 改动 ⑩:前端权限适配 — 只显示公共区 + 本人文件夹;他人私人/群组库不出现。
//               后端检索 API 若无权限过滤,下方注明"检索权限待后端实施"。

interface TreeNode extends RawFolder {
  children: TreeNode[];
}

/** 把 folder id 解析成可读名(优先 path 末段,fallback 到 name/id) */
function describeFolder(id: string, folderItems: RawFolder[]): string {
  const f = folderItems.find((x) => x.id === id);
  if (!f) return id;
  if (f.path) {
    const segs = f.path.split("/").filter(Boolean);
    return segs.slice(-2).join("/") || f.name;
  }
  return f.name;
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
  // R32-C:弹窗开关(点击"添加知识库"才打开)
  const [pickerOpen, setPickerOpen] = React.useState(false);

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

  // 2. 构两级树(弹窗内用)
  const tree = React.useMemo<TreeNode[]>(() => {
    const visible = folderItems.filter(isPublicFolder);
    const byParent = new Map<string, RawFolder[]>();
    for (const f of visible) {
      const k = f.parentId ?? "(root)";
      const arr = byParent.get(k) ?? [];
      arr.push(f);
      byParent.set(k, arr);
    }

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

  React.useEffect(() => {
    if (expanded.size === 0 && tree.length > 0) {
      const toExpand = new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id));
      if (toExpand.size > 0) setExpanded(toExpand);
    }
  }, [tree, expanded.size]);

  // 已选项可读名(用于页面 chip 展示,不罗列目录)
  const selectedChips = selectedFolders.map((sid) => ({
    id: sid,
    label: describeFolder(sid, folderItems),
  }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground/65">
          <FolderTree className="size-3.5 text-sky-500/70" />
          知识库 · 组织公共知识区
          <span className="font-mono text-[11px] text-foreground/40">{selectedFolders.length} 已选</span>
        </div>
        {editing && (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-[11.5px] font-medium text-foreground/75 hover:bg-muted/50 hover:text-foreground transition-colors"
            data-testid="kb-picker-trigger"
          >
            <FolderOpen className="size-3" />
            {selectedFolders.length > 0 ? "管理知识库" : "添加知识库"}
          </button>
        )}
      </div>

      {/* 已选清单(chip 紧凑展示,不罗列目录树) */}
      <div className="rounded-xl border border-border bg-card p-5">
        {selectedFolders.length === 0 ? (
          <p className="text-[12px] text-foreground/50">
            尚未选择知识库。{editing ? "点击右上「添加知识库」从组织公共区选择。" : "点上方「编辑」开启选择。"}
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {selectedChips.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-[11px] ring-1 ring-border/60"
                title={c.id}
              >
                <FileText className="size-3 text-foreground/45" />
                <span className="max-w-[180px] truncate">{c.label}</span>
                {editing && (
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="ml-0.5 text-foreground/40 hover:text-rose-500 transition-colors"
                    aria-label={`移除 ${c.label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        {orphanCount > 0 && (
          <p className="mt-2 flex items-center gap-1 text-[11px] text-foreground/45">
            <AlertCircle className="size-3" />
            另有 {orphanCount} 个已选库不在公共区(被权限过滤),保存时仍会保留但建议取消选择。
          </p>
        )}
      </div>

      {/* 权限说明(R32-C 改动 ⑩) */}
      <div className="rounded-lg border border-dashed border-border bg-muted/15 px-3 py-2 text-[11px] leading-relaxed text-foreground/55">
        <p className="flex items-center gap-1">
          <Lock className="size-3" />
          仅显示<strong className="mx-0.5 text-foreground/70">组织公共区</strong>知识库;
          数字员工个人库、群组协作库、他人私人库已自动隐藏(权限隔离)。
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-foreground/40">
          <Info className="size-3" />
          检索权限规则:个人文件夹可检索;仅能检索本人加入的群组知识库。
          <span className="text-amber-600 dark:text-amber-400">后端检索 API 权限过滤待实施。</span>
        </p>
      </div>

      {/* R32-C 改动 ⑨:弹窗 — 点击"添加知识库"才加载两级目录 */}
      {pickerOpen && (
        <KnowledgeFolderPickerModal
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          tree={tree}
          expanded={expanded}
          toggleExpand={toggleExpand}
          selectedSet={selectedSet}
          onToggle={toggle}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── 知识库选择弹窗(点击"添加知识库"才打开,内含两级目录) ────────────────────

function KnowledgeFolderPickerModal({
  open,
  onOpenChange,
  tree,
  expanded,
  toggleExpand,
  selectedSet,
  onToggle,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tree: TreeNode[];
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  selectedSet: Set<string>;
  onToggle: (id: string) => void;
  loading: boolean;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  const pickedCount = selectedSet.size;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="选择知识库"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex w-full max-w-lg max-h-[80vh] flex-col rounded-xl bg-card ring-1 ring-foreground/10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-sky-500/70" />
            <h3 className="text-sm font-semibold tracking-tight">选择知识库 · 组织公共区</h3>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 两级目录树 */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <p className="py-6 text-center text-[12px] text-foreground/45">加载中…</p>
          ) : tree.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-foreground/50">
              暂无可选公共知识库。
            </p>
          ) : (
            <ul className="space-y-0.5">
              {tree.map((l1) => {
                const checked1 = selectedSet.has(l1.id);
                const isOpen = expanded.has(l1.id);
                const hasChildren = l1.children.length > 0;
                return (
                  <li key={l1.id}>
                    <label
                      className={`flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-[12px] transition-colors cursor-pointer hover:bg-muted/50 ${checked1 ? "bg-muted/40 ring-1 ring-foreground/10" : ""}`}
                    >
                      {hasChildren ? (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); toggleExpand(l1.id); }}
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
                        onChange={() => onToggle(l1.id)}
                        className="size-3.5 accent-foreground/70"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground/85">{l1.name}</span>
                      {l1.docCount !== undefined && l1.docCount > 0 && (
                        <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">{l1.docCount} 文档</span>
                      )}
                    </label>

                    {hasChildren && isOpen && (
                      <ul className="ml-7 mt-0.5 space-y-0.5 border-l border-border/60 pl-2.5">
                        {l1.children.map((l2) => {
                          const checked2 = selectedSet.has(l2.id);
                          return (
                            <li key={l2.id}>
                              <label
                                className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] transition-colors cursor-pointer hover:bg-muted/50 ${checked2 ? "bg-muted/40 ring-1 ring-foreground/10" : ""}`}
                              >
                                <FileText className="size-3 shrink-0 text-foreground/45" />
                                <input
                                  type="checkbox"
                                  checked={checked2}
                                  onChange={() => onToggle(l2.id)}
                                  className="size-3.5 accent-foreground/70"
                                />
                                <span className="min-w-0 flex-1 truncate text-foreground/75">{l2.name}</span>
                                {l2.docCount !== undefined && l2.docCount > 0 && (
                                  <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">{l2.docCount} 文档</span>
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
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between border-t border-border bg-muted/10 px-5 py-3">
          <span className="font-mono text-xs text-muted-foreground">已选 {pickedCount} 个</span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-foreground px-3 py-1.5 text-[12px] font-medium text-background hover:opacity-90 transition-opacity"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
}
