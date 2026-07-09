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
}

interface RelatedAgent {
  id: string;
  name: string;
  displayName: string | null;
  pipelines: string[]; // 共同出现的 pipeline 名字
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
        <div className="space-y-5">
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

          <div className="grid gap-5 lg:grid-cols-2">
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
                    className="flex w-full items-center justify-between rounded-2xl bg-card px-4 py-3 text-left ring-1 ring-border hover:ring-foreground/30"
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
                  <li className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-border">
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
              <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
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
  const graph = React.useMemo(() => buildAgentGraph(agent, bots, related, pipelines), [
    agent,
    bots,
    related,
    pipelines,
  ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-[13px] font-medium">
          <Network className="size-4 text-foreground/65" />
          协作关系图
          <span className="ml-2 font-mono text-[10.5px] font-normal text-foreground/50">
            {bots.length} 入口 · {related.length} 关联员工 · {graph.resourceCount} 资源
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
  // 三列布局:入口(左) → 本 Agent(中心高亮) → 资源簇(右)
  // self 必须是视觉中心:大节点、紫色高亮、所有边汇聚于此。
  const X_ENTRY = 0;
  const X_SELF = 300;
  const X_RES = 620;

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

  // 按类别聚合成 5 个簇(空类别不显示)
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
  const height = Math.max(440, maxRows * 110 + 100);

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

  // 2) 本 Agent(中心,大节点 + 紫色高亮)
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

  // 3) 关联 Agent:self 下方紧凑堆叠(不抢中心,虚线表示弱关联)
  //    视觉上 self 在中心,related 在下方作为"同 pipeline 协作"的辅助信息。
  const relatedStartY = centerY + 120;
  related.forEach((r, i) => {
    nodes.push({
      id: `related-${r.id}`,
      type: "relation",
      position: { x: X_SELF, y: relatedStartY + i * 90 },
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
        label: r.pipelines[0] ? `${r.pipelines[0]}${r.pipelines.length > 1 ? ` +${r.pipelines.length - 1}` : ""}` : "",
        labelStyle: { fontSize: 10, fill: "rgb(14 165 233 / 0.85)" },
        labelBgStyle: { fill: "rgb(255 255 255 / 0.85)" },
      }),
    );
  });

  // 4) 资源簇节点(右列):同类合并为 1 个大节点,带数量 badge
  const clusterStartY = centerY - ((clusters.length - 1) * 100) / 2;
  clusters.forEach((c, i) => {
    const id = `cluster-${c.cat}`;
    const names = c.items;
    const preview = names.slice(0, 2).join("、") + (names.length > 2 ? ` 等 ${names.length} 项` : names.length === 1 ? "" : "");
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
    // 边:self → 簇(strong 紫色加粗,强调"本员工拥有这些资源")
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
        R15-A · 多 Bot 字段(只读)
      </h3>
      <div className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
        <Row label="工作目录 · working_dir">
          <div className="inline-flex items-center gap-2">
            <code className="font-mono text-[12.5px]">
              {workingDir || (
                <span className="text-foreground/40">未设置(默认 /workspace/agents/&lt;id&gt;)</span>
              )}
            </code>
            <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-mono text-foreground/45">
              只读
            </span>
          </div>
        </Row>
        <Row label="绑定频道 · channel_ids">
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
