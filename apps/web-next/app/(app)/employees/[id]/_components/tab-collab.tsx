"use client";

/**
 * R28-B: Agent 协作关系图 + 可见性配置。
 *
 * 重构:原 tab-collab 是文字说明 + 占位图;现替换为 React Flow 实际关系图:
 *
 *   入口层         本Agent              资源层
 *   ┌──────┐                          ┌──────────┐
 *   │飞书bot│──→ [不盈] ─────────────→│KB:技术文档│
 *   └──────┘    ├──→ [墨言](外链虚线)  │技能:brain │
 *               ├──→ [守静](外链虚线)  │MCP:GitHub │
 *               [资源汇总]              └──────────┘
 *               KB/技能/工具/MCP/任务
 *
 * 节点:
 *   - 入口(绿):该 Agent 实际绑定的 bot 入口(从 bot_configs 拉,无配置不显示)
 *   - 本 Agent(紫,中心高亮):当前 Agent
 *   - 关联 Agent(蓝虚线):pipeline 里一起出现的其他 agent
 *   - 资源(灰):KB / 技能 / 工具 / MCP / 任务
 *
 * 配置区:
 *   - 主理人(owner_user_id):ResourcePicker 选真人(保留 R27 行为)
 *   - 可见性(visibility):radio(私有/分组/全局) + 说明 "影响后续任务调度权限"
 *   - R15-A 多 Bot 字段:工作目录/绑定频道/温度/类型(只读)
 */

import * as React from "react";
import { useAgent, updateAgent, type Agent } from "../../_lib/data";
import { api } from "@/lib/api";
import { AvatarMark } from "../../_components/avatar-mark";
import {
  Network,
  Bot,
  User2,
  Info,
  Users,
  Database,
  Workflow,
  Wrench,
  Layers,
  Radio,
  Plug,
  MessageSquare,
  Globe,
  Lock,
  UsersRound,
  Circle,
  AlertTriangle,
  Cable,
  Plus,
  X,
  Loader2,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  EditPane,
  agentToDraft,
  diffDraft,
} from "./edit-mode";
import {
  ResourcePicker,
  type ResourceItem,
} from "@/components/resource-picker/resource-picker";
import {
  RelationGraph,
  dashedEdge,
  strongEdge,
  type RelationNode,
  type RelationEdge,
  type RelationNodeData,
} from "@/components/relation-graph/relation-graph";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { cn } from "@/lib/utils";

// ────────────────────────────────────────────────────────────
// 类型 & 常量
// ────────────────────────────────────────────────────────────

interface Person {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface BotInfo {
  id?: string;
  name: string;
  platform: string;
  agentId?: string;
  // R34-B: 富字段(用于入口管理可视化 / 占用标注 / 在线状态)
  bot_id?: string;
  display_name?: string;
  remark?: string;
  engine?: string;
  paused?: boolean;
  updated_at?: string;
}

interface RelatedAgent {
  id: string;
  name: string;
  displayName: string | null;
  pipelines: string[]; // 共同出现的 pipeline 名字
}

/** 简版 agent 行(用于入口占用归属展示 + 切换时定位旧绑定)。 */
interface AgentRow {
  id: string;
  name: string;
  displayName: string | null;
  channelIds: string[];
}

const FIELDS = ["owner_user_id", "visibility"];

const VISIBILITY_OPTIONS: Array<{
  value: Agent["visibility"];
  label: string;
  desc: string;
  icon: typeof Lock;
}> = [
  {
    value: "private",
    label: "私有",
    desc: "仅主理人可调度,其他人看不到",
    icon: Lock,
  },
  {
    value: "team",
    label: "分组",
    desc: "组内成员可调度(pipeline 可串联)",
    icon: UsersRound,
  },
  {
    value: "public",
    label: "全局",
    desc: "全员可调度,所有 pipeline 自动可选",
    icon: Globe,
  },
];

const CATEGORY_ICON = { kb: "database", skill: "workflow", tool: "wrench", mcp: "plug", task: "network" } as const;
const CATEGORY_LABEL = { kb: "知识库", skill: "技能", tool: "工具", mcp: "MCP", task: "任务" } as const;
type ResCat = keyof typeof CATEGORY_ICON;

const PLATFORM_META: Record<string, { label: string; icon: string }> = {
  feishu: { label: "飞书", icon: "message" },
  dingtalk: { label: "钉钉", icon: "message" },
  wechatwork: { label: "企业微信", icon: "message" },
  wechat: { label: "微信", icon: "message" },
  slack: { label: "Slack", icon: "message" },
  telegram: { label: "Telegram", icon: "message" },
  web: { label: "网页", icon: "globe" },
  api: { label: "API", icon: "plug" },
};
function platformMeta(p: string) {
  return PLATFORM_META[p] ?? { label: p, icon: "radio" };
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

export function TabCollab({ id }: { id: string }) {
  const { agent, loading, reload } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});
  const [people, setPeople] = React.useState<Person[]>([]);
  const [ownerPickerOpen, setOwnerPickerOpen] = React.useState(false);

  // 关系图数据
  const [bots, setBots] = React.useState<BotInfo[]>([]);
  const [related, setRelated] = React.useState<RelatedAgent[]>([]);
  const [pipelinesOfAgent, setPipelinesOfAgent] = React.useState<{ id: string; name: string }[]>([]);
  // R34-B: 全量 agent 行(入口占用归属 + 切换时定位旧绑定)
  const [agentRows, setAgentRows] = React.useState<AgentRow[]>([]);

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

  const loadRelationData = React.useCallback(async () => {
    try {
      const [botRes, pipeRes] = await Promise.all([
        api<{ bots?: BotInfo[] } | BotInfo[]>("/api/bots").catch(() => ({ bots: [] })),
        api<{ data?: any[] } | any[]>("/api/v2/admin/pipelines").catch(() => ({ data: [] })),
      ]);
      const botList = (botRes as any)?.bots ?? (Array.isArray(botRes) ? botRes : []);
      setBots(botList.filter((b: BotInfo) => b && b.name && b.platform));

      const pipes = (pipeRes as any)?.data ?? (Array.isArray(pipeRes) ? pipeRes : []);
      // 找出本 agent 参与的 pipeline
      const myPipes = (pipes as any[])
        .filter((p) => Array.isArray(p.nodes) && p.nodes.some((n: any) => n?.agentTemplateId === id))
        .map((p) => ({ id: p.id, name: p.name, nodes: p.nodes as any[] }));
      setPipelinesOfAgent(myPipes.map((p) => ({ id: p.id, name: p.name })));

      // 关联 agent:同 pipeline 出现的其他 agentTemplateId
      const relatedMap = new Map<string, { name: string; displayName: string | null; pipelines: Set<string> }>();
      for (const p of myPipes) {
        for (const n of p.nodes) {
          const aid = n?.agentTemplateId;
          if (!aid || aid === id) continue;
          if (!relatedMap.has(aid)) {
            relatedMap.set(aid, { name: aid, displayName: n?.label ?? aid, pipelines: new Set() });
          }
          relatedMap.get(aid)!.pipelines.add(p.name);
        }
      }
      // 尝试拉这些 agent 的真实 display_name
      const relatedIds = [...relatedMap.keys()];
      if (relatedIds.length > 0) {
        try {
          const empRes = await api<{ data?: { items?: any[] } } | { items?: any[] }>(
            "/api/v2/employees?filter=all&limit=200",
          );
          const empList = (empRes as any)?.data?.items ?? (empRes as any)?.items ?? [];
          const nameById = new Map<string, string>();
          for (const e of empList) nameById.set(e.id, e.display_name ?? e.name);
          for (const [aid, info] of relatedMap) {
            const better = nameById.get(aid);
            if (better) info.displayName = better;
          }
        } catch {
          // 降级用 node.label
        }
      }
      setRelated(
        [...relatedMap.entries()].map(([rid, info]) => ({
          id: rid,
          name: info.name,
          displayName: info.displayName,
          pipelines: [...info.pipelines],
        })),
      );

      // R34-B: 拉全量 agent 行(入口占用归属 + 切换时定位旧绑定 channel_ids)
      try {
        const empRes = await api<{ data?: { items?: any[] } } | { items?: any[] }>(
          "/api/v2/employees?filter=all&limit=200",
        );
        const empList = (empRes as any)?.data?.items ?? (empRes as any)?.items ?? [];
        setAgentRows(
          (empList as any[]).map((e) => ({
            id: e.id,
            name: e.name ?? e.display_name ?? e.id,
            displayName: e.display_name ?? e.name ?? null,
            channelIds: Array.isArray(e.channel_ids) ? e.channel_ids : [],
          })),
        );
      } catch {
        setAgentRows([]);
      }
    } catch (e) {
      console.error("[collab] loadRelationData failed:", e);
    }
  }, [id]);

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

  React.useEffect(() => {
    if (id) void loadRelationData();
  }, [id, loadRelationData]);

  if (loading) return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  if (!agent) return null;

  const ownerId = String(draft.owner_user_id ?? (agent.raw as any)?.owner_user_id ?? "");
  const owner = people.find((p) => p.id === ownerId) ?? null;
  const ownerName = owner?.name ?? agent.ownerName ?? "未指定";

  const visibilityValue = (draft.visibility as Agent["visibility"]) ?? "team";

  const isDirty = Object.keys(diffDraft(origDraft, draft)).length > 0;

  const onSave = async (ctx: {
    save: (p: Record<string, unknown>) => Promise<boolean>;
    cancelEdit: () => void;
  }) => {
    const patch = diffDraft(origDraft, draft);
    if (Object.keys(patch).length === 0) {
      ctx.cancelEdit();
      return;
    }
    const ok = await ctx.save(patch);
    if (!ok) setDraft(origDraft);
  };

  const ownerItems: ResourceItem[] = people.map((p) => ({
    id: p.id,
    label: p.name,
    description: `${p.email.split("@")[0]} · ${p.role}`,
  }));

  return (
    <EditPane id={id} label="collab" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => (
        <div className="space-y-4">
          {/* === 协作关系图说明 === */}
          <div className="flex items-start gap-2 rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4 text-[12.5px] text-foreground/80">
            <Info className="mt-0.5 size-3.5 shrink-0 text-foreground/70" />
            <div>
              <p className="font-medium text-foreground/90">协作关系图(只读)</p>
              <p className="mt-0.5 leading-relaxed">
                左侧入口(实际绑定的 bot) → 中间本数字员工 → 右侧资源(知识库/技能/工具/MCP/任务)。
                <strong className="mx-1 text-foreground">蓝色虚线</strong>
                指向同 pipeline 里一起出现的其他数字员工(关联员工)。
              </p>
            </div>
          </div>

          {/* === 协作关系图画布 === */}
          <AgentRelationCanvas
            agent={agent}
            bots={bots.filter((b) => b.agentId === agent.id)}
            related={related}
            pipelines={pipelinesOfAgent}
          />

          {/* === R34-B: 接入入口管理(绑定/解绑/独占/切换确认)=== */}
          <EntryManagement agent={agent} bots={bots} agentRows={agentRows} onSaved={reload} />

          <div className="grid gap-4 md:grid-cols-2">
            {/* === 主理人 === */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
                <User2 className="size-4 text-foreground/45" />
                主理人 · Owner
              </h3>
              {ctx.editing ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setOwnerPickerOpen(true)}
                    className="flex w-full items-center justify-between rounded-xl border border-border bg-card p-5 text-left hover:border-foreground/30"
                    data-testid="owner-picker-trigger"
                  >
                    <span className="flex items-center gap-2">
                      <Users className="size-4 text-foreground/45" />
                      <span className="text-[13.5px]">{ownerName}</span>
                    </span>
                    <span className="font-mono text-[11px] text-foreground/45">点击选择…</span>
                  </button>
                  <ResourcePicker
                    open={ownerPickerOpen}
                    onOpenChange={setOwnerPickerOpen}
                    title="选择主理人(真人)"
                    items={ownerItems}
                    selectedIds={ownerId ? [ownerId] : []}
                    multi={false}
                    confirmText="确定归属人"
                    onConfirm={(selected) => {
                      if (selected.length > 0) {
                        setDraft({ ...draft, owner_user_id: selected[0].id });
                      } else {
                        setDraft({ ...draft, owner_user_id: "" });
                      }
                    }}
                  />
                  {ownerId && (
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, owner_user_id: "" })}
                      className="text-[11px] text-foreground/45 hover:text-foreground"
                    >
                      清空归属人
                    </button>
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  <li className="flex items-center justify-between rounded-xl border border-border bg-card p-5">
                    <span className="text-[13.5px]">{ownerName}</span>
                    <span className="font-mono text-[11px] text-foreground/45">业务所有者</span>
                  </li>
                </ul>
              )}
            </section>

            {/* === 可见性配置(③ 新增)=== */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
                <Radio className="size-4 text-foreground/45" />
                可见性 · Visibility
              </h3>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="space-y-2">
                  {VISIBILITY_OPTIONS.map((opt) => {
                    const selected = visibilityValue === opt.value;
                    const disabled = !ctx.editing;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setDraft({ ...draft, visibility: opt.value })}
                        data-testid={`visibility-${opt.value}`}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                          selected
                            ? "border-violet-500/60 bg-violet-500/[0.07] ring-1 ring-violet-500/40"
                            : "border-border bg-background/50 hover:border-foreground/25",
                          disabled && "cursor-default opacity-80 hover:border-border",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border",
                            selected ? "border-violet-500" : "border-foreground/30",
                          )}
                        >
                          {selected && <Circle className="size-2.5 fill-violet-500 text-violet-500" />}
                        </span>
                        <opt.icon
                          className={cn(
                            "mt-0.5 size-4 shrink-0",
                            selected ? "text-violet-600 dark:text-violet-300" : "text-foreground/55",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-foreground/90">{opt.label}</span>
                            <code className="font-mono text-[10px] text-foreground/45">{opt.value}</code>
                          </div>
                          <p className="mt-0.5 text-[11.5px] leading-relaxed text-foreground/65">
                            {opt.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-500/[0.07] px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300/90">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span>
                    影响<strong className="mx-0.5">后续任务调度权限</strong>:pipeline 编排时只能选可见范围内的数字员工。
                    {ctx.editing ? "切换后点顶部保存生效。" : "点上方「编辑」开启修改。"}
                  </span>
                </div>
              </div>
            </section>
          </div>

          {/* === R15-A 字段(只读展示)=== */}
          <R15AFields agent={agent} />
        </div>
      )}
    </EditPane>
  );
}

// ────────────────────────────────────────────────────────────
// 协作关系图子组件
// ────────────────────────────────────────────────────────────

function AgentRelationCanvas({
  agent,
  bots,
  related,
  pipelines,
}: {
  agent: Agent;
  bots: BotInfo[];
  related: RelatedAgent[];
  pipelines: { id: string; name: string }[];
}) {
  // R33-B 自检重绘计数器 — edges=0 时 +1 触发 buildAgentGraph 重算
  const [rebuildTick, setRebuildTick] = React.useState(0);
  const rebuild = React.useCallback(() => setRebuildTick((t) => t + 1), []);

  const graph = React.useMemo(
    () => buildAgentGraph(agent, bots, related, pipelines),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agent, bots, related, pipelines, rebuildTick],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-medium">
          <Network className="size-4 text-foreground/65" />
          协作关系图
          <span className="ml-2 font-mono text-[10.5px] font-normal text-foreground/50">
            中心 = {agent.displayName || agent.name} · {bots.length} 入口 · {related.length} 关联 · {graph.resourceCount} 资源
          </span>
        </h3>
        <div className="flex items-center gap-3 font-mono text-[10.5px] text-foreground/50">
          <LegendDot color="bg-emerald-500" label="入口" />
          <LegendDot color="bg-violet-500" label="本员工" />
          <LegendDot color="bg-sky-500" label="关联" />
          <LegendDot color="bg-zinc-400" label="资源" />
        </div>
      </div>
      <RelationGraph
        nodes={graph.nodes}
        edges={graph.edges}
        height={graph.height}
        emptyHint="该数字员工暂无入口与资源绑定"
        onEmptyEdges={rebuild}
      />
    </div>
  );
}

function buildAgentGraph(
  agent: Agent,
  bots: BotInfo[],
  related: RelatedAgent[],
  pipelines: { id: string; name: string }[],
): { nodes: RelationNode[]; edges: RelationEdge[]; height: number; resourceCount: number } {
  // R33-B 四列布局(与真人协作图完全统一):
  //   入口(0) → 本Agent(320 中心高亮) → 关联Agent(640) → 资源簇(940)
  // self 永远是视觉中心:大节点、紫色高亮、所有边汇聚于此。
  // R33-B 修复:不再因 edges=0 丢弃 self 节点(原 R32-C 反模式导致中心消失)。
  const X_ENTRY = 0;
  const X_SELF = 320;
  const X_RELATED = 640;
  const X_RES = 940;

  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];

  // 资源汇总(本 agent 实际拥有的)
  const raw = agent.raw as Record<string, unknown> | null;
  const kbs = Array.isArray(raw?.knowledgeFolders) ? (raw!.knowledgeFolders as string[])
    : Array.isArray(raw?.knowledge_folders) ? (raw!.knowledge_folders as string[])
    : agent.knowledgeFolders;
  const skills = Array.isArray(raw?.skills) ? (raw!.skills as string[]) : agent.skills;
  const tools = Array.isArray(raw?.tools) ? (raw!.tools as string[]) : agent.tools;
  const mcps = Array.isArray(raw?.mcpServers) ? (raw!.mcpServers as string[])
    : Array.isArray(raw?.mcp_servers) ? (raw!.mcp_servers as string[])
    : agent.mcpServers;
  const tasks = pipelines.map((p) => p.name);

  const clusters: Array<{ cat: ResCat; items: string[] }> = [
    { cat: "kb", items: kbs },
    { cat: "task", items: tasks },
    { cat: "skill", items: skills },
    { cat: "tool", items: tools },
    { cat: "mcp", items: mcps },
  ].filter((c) => c.items.length > 0);

  const totalResCount = clusters.reduce((n, c) => n + c.items.length, 0);

  // 高度:取入口/关联/资源簇的最大行数,保证 self 居中且画布紧凑
  const entryRows = Math.max(1, bots.length);
  const relatedRows = Math.max(0, related.length);
  const clusterRows = Math.max(1, clusters.length);
  const maxRows = Math.max(entryRows, relatedRows, clusterRows);
  const height = Math.max(460, maxRows * 110 + 120);

  const centerY = height / 2 - 30;

  // 1) 入口节点(左列):整体垂直居中对齐 self
  const entryStartY = centerY - ((bots.length - 1) * 90) / 2;
  bots.forEach((b, i) => {
    const meta = platformMeta(b.platform);
    nodes.push({
      id: `entry-${b.id ?? b.name}`,
      type: "relation",
      position: { x: X_ENTRY, y: entryStartY + i * 90 },
      data: {
        kind: "entry",
        label: b.name,
        sublabel: `${meta.label} · 入口`,
        icon: meta.icon,
      } as RelationNodeData,
    });
  });

  // 2) 本 Agent(中心,大节点 + 紫色高亮)— R33-B:永不消失
  nodes.push({
    id: "self",
    type: "relation",
    position: { x: X_SELF, y: centerY },
    data: {
      kind: "self",
      size: "lg",
      label: agent.displayName || agent.name,
      sublabel: `${agent.role} · ${agent.model.split("-").slice(0, 2).join("-")}`,
      icon: "bot",
      badge: "本员工",
    } as RelationNodeData,
  });

  // 3) 关联 Agent(独立列 X_RELATED)— R33-B 修正:不再占用 X_SELF 列,避免与 self 视觉打架
  const relatedStartY = centerY - ((related.length - 1) * 90) / 2;
  related.forEach((r, i) => {
    nodes.push({
      id: `related-${r.id}`,
      type: "relation",
      position: { x: X_RELATED, y: relatedStartY + i * 90 },
      data: {
        kind: "related",
        label: r.displayName || r.name,
        sublabel: `关联 · ${r.pipelines.length} 个共同任务`,
        icon: "bot",
      } as RelationNodeData,
    });
    edges.push(
      dashedEdge({
        id: `e-self-related-${r.id}`,
        source: "self",
        target: `related-${r.id}`,
        label: r.pipelines[0]
          ? `${r.pipelines[0]}${r.pipelines.length > 1 ? ` +${r.pipelines.length - 1}` : ""}`
          : "",
        labelStyle: { fontSize: 10, fill: "rgb(14 165 233 / 0.85)" },
        labelBgStyle: { fill: "rgb(255 255 255 / 0.85)" },
      }),
    );
  });

  // 4) 资源簇节点(最右列):同类合并为 1 个大节点
  const clusterStartY = centerY - ((clusters.length - 1) * 100) / 2;
  clusters.forEach((c, i) => {
    const id = `cluster-${c.cat}`;
    const names = c.items;
    const preview =
      names.slice(0, 2).join("、") +
      (names.length > 2 ? ` 等 ${names.length} 项` : names.length === 1 ? "" : "");
    nodes.push({
      id,
      type: "relation",
      position: { x: X_RES, y: clusterStartY + i * 100 },
      data: {
        kind: "resource",
        size: "lg",
        label: `${CATEGORY_LABEL[c.cat]} · ${names.length} 项`,
        sublabel: preview || "—",
        icon: CATEGORY_ICON[c.cat],
        category: c.cat,
        badge: `×${names.length}`,
        items: names,
      } as RelationNodeData,
    });
    edges.push(
      strongEdge({
        id: `e-self-${id}`,
        source: "self",
        target: id,
      }),
    );
  });

  // 5) 入口 → self(strong 让入口汇聚感强)
  bots.forEach((b) => {
    edges.push(
      strongEdge({
        id: `e-entry-${b.id ?? b.name}-self`,
        source: `entry-${b.id ?? b.name}`,
        target: "self",
      }),
    );
  });

  // R33-B 修复(原 R32-C 反模式):
  //   原代码 edges=0 时返回 `{ nodes: [], edges: [] }` → self 节点消失,中心空白。
  //   违背用户原话"中心节点不消失"。改为保留 self 节点 + 让 RelationGraph 走 onEmptyEdges 自检。
  // 不再 return 空。

  // R33-B 终极兜底:若 edges 仍为 0(self 完全孤立 — 无入口/无资源/无关联),
  // 补一个"未配置"空状态节点 + dashed 边,确保:
  //   1. self 永远有连线(杜绝孤点漂浮,杜绝"连线不显示"顽固 bug 复现)
  //   2. 避免触发 onEmptyEdges 无限重绘(有边了就不触发)
  //   3. 给用户清晰的"需要配置"视觉提示
  if (edges.length === 0) {
    const emptyId = "cluster-empty";
    nodes.push({
      id: emptyId,
      type: "relation",
      position: { x: X_RES, y: centerY },
      data: {
        kind: "resource",
        size: "lg",
        label: "未配置入口与资源",
        sublabel: "点上方「编辑」开始配置",
        icon: "bot",
      } as RelationNodeData,
    });
    edges.push(
      dashedEdge({
        id: `e-self-${emptyId}`,
        source: "self",
        target: emptyId,
      }),
    );
  }

  // 防御性:扫描所有节点,任何孤点(无连线)补一条到 self 的 dashed 边。
  // 确保画布上"每个节点都有连线",杜绝孤点漂浮(self 自身除外)。
  const wiredIds = new Set<string>();
  for (const e of edges) {
    wiredIds.add(e.source);
    wiredIds.add(e.target);
  }
  for (const n of nodes) {
    if (!wiredIds.has(n.id) && n.id !== "self") {
      edges.push(
        dashedEdge({
          id: `e-self-orphan-${n.id}`,
          source: "self",
          target: n.id,
        }),
      );
    }
  }

  return { nodes, edges, height, resourceCount: totalResCount };
}

// ────────────────────────────────────────────────────────────
// R15-A 字段区块(只读展示,可见性已独立分区,此处不再展示)
// ────────────────────────────────────────────────────────────

function R15AFields({ agent }: { agent: Agent }) {
  const raw = agent.raw as Record<string, unknown> | null;
  const workingDir = (raw?.working_dir as string) || agent.workingDir;
  const channelIds = Array.isArray(raw?.channel_ids)
    ? (raw?.channel_ids as string[])
    : agent.channelIds;
  const temperature =
    typeof raw?.temperature === "number" ? (raw.temperature as number) : agent.temperature;
  const isTemplate = Boolean(raw?.is_template) || agent.isTemplate;

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 text-[13px] font-medium tracking-tight text-foreground/65">
        运行参数(只读)
      </h3>
      <div className="space-y-2 rounded-xl border border-border bg-card p-5">
        <Row label="工作目录 · 系统生成">
          <div className="inline-flex items-center gap-2">
            <code className="font-mono text-[12.5px]">
              {workingDir || (
                <span className="text-foreground/40">未设置(默认 /workspace/agents/&lt;编号&gt;)</span>
              )}
            </code>
            <span className="inline-flex items-center gap-1 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/45">
              <Lock className="size-2.5" />
              锁定
            </span>
          </div>
        </Row>
        <Row label="绑定入口 · channel_ids">
          {channelIds.length === 0 ? (
            <span className="text-foreground/40 text-[12.5px]">未绑定</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {channelIds.map((c) => (
                <code
                  key={c}
                  className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-[11px]"
                >
                  {c}
                </code>
              ))}
            </div>
          )}
        </Row>
        <Row label="温度 · temperature">
          <span className="font-mono text-[12.5px]">{temperature.toFixed(2)}</span>
          <span className="ml-2 text-[11px] text-foreground/45">
            {temperature < 0.3 ? "保守 · 偏确定" : temperature > 0.9 ? "发散 · 偏创造" : "均衡"}
          </span>
        </Row>
        <Row label="类型 · is_template">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-mono",
              isTemplate ? "bg-foreground text-background" : "bg-muted text-foreground/70",
            )}
          >
            {isTemplate ? "模板" : "实例"}
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

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("size-2 rounded-sm", color)} />
      {label}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// R34-B: 接入入口管理 — 独占模式(空闲可选 / 已占用置灰+标注归属)
//        + 切换二次确认弹窗(展示旧绑定,前端编排释放→认领)
// ────────────────────────────────────────────────────────────

/** 从 bot 对象取 bot_id(兼容 local/DB/paused 三种来源) */
function getBotId(b: BotInfo): string {
  return String((b as any).bot_id || b.id || b.name || "");
}

/** 从 bot 对象取显示名 */
function getBotDisplayName(b: BotInfo): string {
  return String((b as any).display_name || (b as any).remark || b.name || "未命名");
}

/** 找到占用某入口的 agent 行(用于标注归属 + 切换时定位旧绑定) */
function findOccupant(botId: string, agentRows: AgentRow[], myId: string): AgentRow | null {
  return agentRows.find((a) => a.id !== myId && a.channelIds.includes(botId)) ?? null;
}

function EntryManagement({
  agent,
  bots,
  agentRows,
  onSaved,
}: {
  agent: Agent;
  bots: BotInfo[];
  agentRows: AgentRow[];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [operating, setOperating] = React.useState<string | null>(null);
  // R35-B: 切换 + 解绑 两个独立确认弹窗目标
  const [switchTarget, setSwitchTarget] = React.useState<BotInfo | null>(null);
  const [unbindTarget, setUnbindTarget] = React.useState<BotInfo | null>(null);

  const raw = agent.raw as Record<string, unknown> | null;
  const channelIds: string[] = Array.isArray(raw?.channel_ids)
    ? (raw?.channel_ids as string[])
    : agent.channelIds;

  const richBots = bots;

  // 已绑定(本 agent 占用)
  const boundBots = richBots.filter((b) => {
    const bid = getBotId(b);
    return (bid && channelIds.includes(bid)) || b.agentId === agent.id;
  });
  const boundIdSet = new Set(boundBots.map((b) => getBotId(b)));

  // R35-B: 分类 — 空闲 / 被其他实例占用
  const freeBots = richBots.filter((b) => {
    const bid = getBotId(b);
    if (!bid || boundIdSet.has(bid)) return false;
    return !findOccupant(bid, agentRows, agent.id);
  });
  const occupiedBots = richBots.filter((b) => {
    const bid = getBotId(b);
    if (!bid || boundIdSet.has(bid)) return false;
    return !!findOccupant(bid, agentRows, agent.id);
  });

  /** R35-B: 提取错误消息(优先 error.code,后端 409 bot_already_bound 给友好提示) */
  function friendlyBindError(err: unknown): string {
    const e: any = err;
    const code = String(e?.error?.code ?? e?.code ?? "");
    if (code === "bot_already_bound" || /already.?bound/i.test(String(e?.message ?? ""))) {
      return "入口已被其他 Agent 占用,先去解绑或切换";
    }
    if (e instanceof Error) return e.message;
    return String(e ?? "未知错误");
  }

  async function bindFree(botId: string) {
    setOperating(botId);
    try {
      await updateAgent(agent.id, { channel_ids: [...channelIds, botId] });
      toast.success("入口绑定成功");
      onSaved();
    } catch (e: unknown) {
      toast.error(`绑定失败:${friendlyBindError(e)}`);
    } finally {
      setOperating(null);
    }
  }

  /** R35-B: 解绑入口 — 由二次确认弹窗触发 */
  async function confirmUnbind() {
    if (!unbindTarget) return;
    const bid = getBotId(unbindTarget);
    const name = getBotDisplayName(unbindTarget);
    setOperating(bid);
    try {
      await updateAgent(agent.id, {
        channel_ids: channelIds.filter((c) => c !== bid),
      });
      toast.success(`已解绑「${name}」`);
      setUnbindTarget(null);
      onSaved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`解绑失败:${msg}`);
    } finally {
      setOperating(null);
    }
  }

  // R34-B: 切换入口 — 前端编排两步(先释放旧绑定,再认领到本 agent)
  async function confirmSwitch() {
    if (!switchTarget) return;
    const bid = getBotId(switchTarget);
    const occupant = findOccupant(bid, agentRows, agent.id);
    setOperating(bid);
    try {
      // 1) 释放旧绑定(从占用 agent 的 channel_ids 移除该入口)
      if (occupant) {
        const remain = occupant.channelIds.filter((c) => c !== bid);
        await updateAgent(occupant.id, { channel_ids: remain });
      }
      // 2) 认领到本 agent
      await updateAgent(agent.id, { channel_ids: [...channelIds, bid] });
      toast.success(
        `已切换入口「${getBotDisplayName(switchTarget)}」${occupant ? `(原归属 ${occupant.displayName || occupant.name} 已自动解除)` : ""}`,
      );
      setSwitchTarget(null);
      onSaved();
    } catch (e: unknown) {
      toast.error(`切换失败:${friendlyBindError(e)}`);
    } finally {
      setOperating(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Cable className="size-4 text-emerald-500" />
          接入入口管理
        </h3>
        <span
          className="font-mono text-[11px] text-foreground/55"
          data-testid="entry-stats"
        >
          <span className="text-emerald-700 dark:text-emerald-300">已绑定 {boundBots.length}</span>
          <span className="mx-1.5 text-foreground/30">·</span>
          <span>空闲 {freeBots.length}</span>
          <span className="mx-1.5 text-foreground/30">·</span>
          <span className="text-amber-700 dark:text-amber-300">占用 {occupiedBots.length}</span>
        </span>
      </div>

      <p className="mb-4 text-[11.5px] leading-relaxed text-muted-foreground">
        每个 Agent 实例可绑定多个入口(飞书 / 钉钉 / 企微等)。
        <strong className="mx-1 text-foreground/80">入口为独占资源</strong>:同一入口同时只能被一个 Agent 实例绑定。
        <strong className="mx-1 text-foreground/80">空闲</strong>入口可直接绑定;
        <strong className="mx-1 text-amber-700 dark:text-amber-300">占用</strong>入口置灰并标注归属,点「切换」会弹出二次确认,自动解除旧绑定再认领。
        解绑当前入口也会弹出二次确认,避免误操作。
      </p>

      {/* ── 已绑定入口(本 agent 占用)── */}
      {boundBots.length === 0 ? (
        <div className="mb-4 rounded-lg border border-dashed border-border px-4 py-5 text-center text-[12.5px] text-muted-foreground">
          暂未绑定任何入口。从下方「空闲」区域绑定,或从「占用」区域切换过来。
        </div>
      ) : (
        <ul className="mb-4 space-y-2" data-testid="entry-bound-list">
          {boundBots.map((b) => {
            const bid = getBotId(b);
            const name = getBotDisplayName(b);
            const meta = platformMeta(b.platform);
            const isOnline = !b.paused && !String(b.engine || "").includes("paused");
            const updatedAt = b.updated_at ? String(b.updated_at).slice(0, 10) : null;
            const isBusy = operating === bid;
            return (
              <li
                key={bid || b.name}
                className="flex items-center justify-between gap-3 rounded-lg ring-1 ring-emerald-500/30 bg-emerald-500/[0.05] px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={cn(
                      "inline-block size-2 shrink-0 rounded-full",
                      isOnline ? "bg-emerald-500" : "bg-foreground/30",
                    )}
                    title={isOnline ? "在线" : "离线"}
                  />
                  <span className="text-[13px] font-medium truncate">{name}</span>
                  <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/50">
                    {meta.label}
                  </span>
                  <span
                    className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300"
                    data-testid={`entry-bound-badge-${bid.slice(0, 8)}`}
                  >
                    已绑定
                  </span>
                  {updatedAt && (
                    <span className="shrink-0 font-mono text-[10.5px] text-foreground/40">
                      绑定于 {updatedAt}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setUnbindTarget(b)}
                  disabled={isBusy}
                  className="shrink-0 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-foreground/55 hover:text-rose-600 hover:bg-rose-500/10 transition-colors disabled:opacity-40"
                  title="解绑(弹出二次确认)"
                  aria-label={`解绑 ${name}`}
                  data-testid={`unbind-entry-${bid.slice(0, 8)}`}
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <X className="size-3.5" />
                      <span>解绑</span>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── 空闲入口(可直接绑定)── */}
      {freeBots.length > 0 && (
        <div className="mb-3">
          <div className="mb-2 flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
            <span>空闲入口</span>
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
              {freeBots.length}
            </span>
          </div>
          <ul className="space-y-1.5" data-testid="entry-free-list">
            {freeBots.map((b) => {
              const bid = getBotId(b);
              const name = getBotDisplayName(b);
              const meta = platformMeta(b.platform);
              const isBusy = operating === bid;
              return (
                <li key={bid}>
                  <button
                    type="button"
                    onClick={() => bindFree(bid)}
                    disabled={isBusy}
                    data-testid={`bind-entry-${bid.slice(0, 8)}`}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left ring-1 ring-border bg-background/40 hover:bg-muted/30 transition-colors disabled:opacity-60"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Plug className="size-3.5 shrink-0 text-foreground/45" />
                      <span className="text-[12.5px] truncate">{name}</span>
                      <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/50">
                        {meta.label}
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300">
                        空闲
                      </span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 text-[11px] text-emerald-700 dark:text-emerald-300">
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="size-3.5" />
                          <span>绑定</span>
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── 被其他 Agent 占用的入口(置灰 + 切换)── */}
      {occupiedBots.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/55">
            <span>被占用的入口</span>
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
              {occupiedBots.length}
            </span>
            <span className="text-foreground/40 normal-case tracking-normal">— 切换前会先解除旧绑定</span>
          </div>
          <ul className="space-y-1.5" data-testid="entry-occupied-list">
            {occupiedBots.map((b) => {
              const bid = getBotId(b);
              const name = getBotDisplayName(b);
              const meta = platformMeta(b.platform);
              const occupant = findOccupant(bid, agentRows, agent.id)!;
              const isBusy = operating === bid;
              return (
                <li key={bid}>
                  <button
                    type="button"
                    onClick={() => setSwitchTarget(b)}
                    disabled={isBusy}
                    data-testid={`switch-entry-${bid.slice(0, 8)}`}
                    className="group flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left ring-1 ring-border bg-muted/20 hover:bg-muted/40 transition-colors disabled:opacity-60 opacity-60 hover:opacity-100 focus-visible:opacity-100"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Lock className="size-3.5 shrink-0 text-amber-600/80 dark:text-amber-400/80" />
                      <span className="text-[12.5px] truncate text-foreground/65">{name}</span>
                      <span className="shrink-0 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/50">
                        {meta.label}
                      </span>
                      <span
                        className="shrink-0 inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-mono text-amber-700 dark:text-amber-300"
                        data-testid={`entry-occupied-badge-${bid.slice(0, 8)}`}
                      >
                        <Lock className="size-2.5" />
                        占用 · {occupant.displayName || occupant.name}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0 text-[11px] text-foreground/55 group-hover:text-foreground/80">
                      {isBusy ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>切换</span>
                          <Plus className="size-3" />
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 切换二次确认弹窗 */}
      {switchTarget && (
        <SwitchConfirmDialog
          bot={switchTarget}
          occupant={findOccupant(getBotId(switchTarget), agentRows, agent.id)}
          myName={agent.displayName || agent.name}
          loading={operating === getBotId(switchTarget)}
          onCancel={() => setSwitchTarget(null)}
          onConfirm={confirmSwitch}
        />
      )}

      {/* R35-B: 解绑二次确认弹窗 */}
      {unbindTarget && (
        <UnbindConfirmDialog
          bot={unbindTarget}
          myName={agent.displayName || agent.name}
          loading={operating === getBotId(unbindTarget)}
          onCancel={() => setUnbindTarget(null)}
          onConfirm={confirmUnbind}
        />
      )}
    </div>
  );
}

/** R35-B: 解绑二次确认弹窗 — 防止误触丢失入口。 */
function UnbindConfirmDialog({
  bot,
  myName,
  loading,
  onCancel,
  onConfirm,
}: {
  bot: BotInfo;
  myName: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bid = getBotId(bot);
  const name = getBotDisplayName(bot);
  const meta = platformMeta(bot.platform);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="unbind-entry-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-rose-500" />
          <h3 id="unbind-entry-title" className="text-sm font-semibold">
            解绑入口确认
          </h3>
        </div>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-foreground/85">
          <p>
            入口<strong className="mx-0.5">「{name}」</strong>
            <span className="ml-1 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/55">
              {meta.label}
            </span>
          </p>
          <p className="text-foreground/70">
            当前绑定:<strong className="mx-0.5">{myName}</strong>
          </p>
          <div className="mt-2 rounded-lg bg-muted/40 p-2.5 ring-1 ring-border">
            <p className="mb-1 font-medium text-foreground/85">解绑后:</p>
            <ul className="ml-4 list-disc space-y-0.5 text-[11.5px] text-foreground/70">
              <li>此入口回归空闲(可绑给其他 Agent 实例)</li>
              <li>{myName} 失去此入口能力,相关消息不再路由到这里</li>
              <li>原有对话历史与会话状态不受影响(若再次绑定可恢复)</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={onConfirm}
            disabled={loading}
            data-testid={`confirm-unbind-${bid.slice(0, 8)}`}
            className="gap-1.5"
          >
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认解绑
          </Button>
        </div>
      </div>
    </div>
  );
}

/** R34-B: 入口切换二次确认弹窗 — 展示旧绑定 + 切换后果说明。 */
function SwitchConfirmDialog({
  bot,
  occupant,
  myName,
  loading,
  onCancel,
  onConfirm,
}: {
  bot: BotInfo;
  occupant: AgentRow | null;
  myName: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const bid = getBotId(bot);
  const name = getBotDisplayName(bot);
  const meta = platformMeta(bot.platform);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="switch-entry-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-500" />
          <h3 id="switch-entry-title" className="text-sm font-semibold">
            切换入口确认
          </h3>
        </div>
        <div className="space-y-2 text-[12.5px] leading-relaxed text-foreground/85">
          <p>
            入口<strong className="mx-0.5">「{name}」</strong>
            <span className="ml-1 rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/55">
              {meta.label}
            </span>
          </p>
          <p className="text-foreground/70">
            当前绑定:{occupant ? <strong className="mx-0.5">{occupant.displayName || occupant.name}</strong> : <span className="text-foreground/45">无</span>}
          </p>
          <div className="mt-2 rounded-lg bg-muted/40 p-2.5 ring-1 ring-border">
            <p className="mb-1 font-medium text-foreground/85">切换后:</p>
            <ul className="ml-4 list-disc space-y-0.5 text-[11.5px] text-foreground/70">
              <li>旧绑定({occupant?.displayName || occupant?.name || "无"})自动解除</li>
              <li>新绑定({myName})立即生效</li>
              <li>智能体整体实例与能力同步更换</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={loading} data-testid={`confirm-switch-${bid.slice(0, 8)}`} className="gap-1.5">
            {loading && <Loader2 className="size-3.5 animate-spin" />}
            确认切换
          </Button>
        </div>
      </div>
    </div>
  );
}
