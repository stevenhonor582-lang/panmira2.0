"use client";

/**
 * R28-B: 真人协作关系图(画布版)。
 *
 * 替代 R26-A 的折叠卡布局,改为 React Flow 只读关系总图:
 *
 *   入口层          Agent层           资源层
 *   ┌──────┐
 *   │飞书bot│──┐         ┌─────→ KB:技术文档
 *   │飞书bot│──┼─→ [不盈]─┼─────→ 技能:brain
 *   └──────┘  │           │      MCP:GitHub
 *              ├──→ [墨言]─┘      任务:审查
 *   ┌──────┐  │
 *   │网页   │──┘
 *
 * 节点:
 *   - 入口(绿):来自 bot_configs 的实际绑定,按平台区分(飞书/微信/...)
 *   - Agent(蓝):该真人可调度的数字员工
 *   - 资源(灰):KB / 技能 / 工具 / MCP / 任务
 *   - 共享资源(红):同一资源被多个 Agent 引用 → 高亮 + 红色边
 *
 * 数据全部来自现有 API(无后端改动):
 *   - /api/v2/people/:id/agents       真人绑定的 agent
 *   - /api/v2/employees/:id           agent 详情(knowledgeFolders/skills/tools)
 *   - /api/v2/admin/pipelines         任务列表(nodes[].agentTemplateId 反查)
 *   - /api/bots                       bot 列表(agentId 反查入口)
 */

import * as React from "react";
import {
  Bot, Network, Database, Workflow, Wrench, Layers,
  AlertTriangle, Info, Radio, Plug, MessageSquare,
} from "lucide-react";
import {
  fetchPersonAgents,
  fetchPipelines,
  type Person,
  type PersonAgent,
  type Pipeline,
} from "../../../_components/data";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  RelationGraph,
  dangerEdge,
  strongEdge,
  type RelationNode,
  type RelationEdge,
  type RelationNodeData,
} from "@/components/relation-graph/relation-graph";

// ────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────

interface AgentResources {
  knowledgeFolders: string[];
  skills: string[];
  tools: string[];
  mcpServers: string[];
}

interface BotInfo {
  id?: string;
  name: string;
  platform: string;
  agentId?: string;
}

interface CollabRow {
  agent: PersonAgent;
  resources: AgentResources;
  pipelines: Pipeline[];
  botEntries: BotInfo[];
}

// ────────────────────────────────────────────────────────────
// 数据拉取
// ────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
function fullPath(p: string): string {
  if (!API_BASE) return p;
  if (p.startsWith("http")) return p;
  return API_BASE + p;
}

/** 拉 agent 详情(knowledgeFolders/skills/tools/mcpServers) */
async function fetchAgentResources(id: string): Promise<AgentResources> {
  try {
    const res = await api<{ data?: Record<string, unknown> } | Record<string, unknown>>(
      fullPath(`/api/v2/employees/${id}`),
    );
    const row = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>);
    const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
    // 后端返回 camelCase;兼容老接口的 snake_case
    return {
      knowledgeFolders: arr(row?.knowledgeFolders ?? row?.knowledge_folders),
      skills: arr(row?.skills),
      tools: arr(row?.tools),
      mcpServers: arr(row?.mcpServers ?? row?.mcp_servers),
    };
  } catch {
    return { knowledgeFolders: [], skills: [], tools: [], mcpServers: [] };
  }
}

/** 拉 bot 列表 */
async function fetchBots(): Promise<BotInfo[]> {
  try {
    const res = await api<{ bots?: BotInfo[] } | BotInfo[]>(
      fullPath("/api/bots"),
    );
    const list = (res as { bots?: BotInfo[] })?.bots ?? (Array.isArray(res) ? (res as BotInfo[]) : []);
    return list.filter((b) => b && b.name && b.platform);
  } catch {
    return [];
  }
}

/** 平台代码 → 中文标签 + 入口图标 */
function platformMeta(p: string): { label: string; icon: string } {
  const map: Record<string, { label: string; icon: string }> = {
    feishu: { label: "飞书", icon: "message" },
    dingtalk: { label: "钉钉", icon: "message" },
    wechatwork: { label: "企业微信", icon: "message" },
    wechat: { label: "微信", icon: "message" },
    slack: { label: "Slack", icon: "message" },
    telegram: { label: "Telegram", icon: "message" },
    web: { label: "网页", icon: "globe" },
    api: { label: "API", icon: "plug" },
  };
  return map[p] ?? { label: p, icon: "radio" };
}

// ────────────────────────────────────────────────────────────
// 重复项检测
// ────────────────────────────────────────────────────────────

interface DuplicateItem {
  resource: string;
  category: "kb" | "skill" | "tool" | "mcp";
  agents: string[];
}

function detectDuplicates(rows: CollabRow[]): DuplicateItem[] {
  const map = new Map<string, DuplicateItem>();
  const push = (
    category: DuplicateItem["category"],
    key: string,
    agentName: string,
  ) => {
    const id = `${category}::${key}`;
    if (!map.has(id)) map.set(id, { resource: key, category, agents: [] });
    const arr = map.get(id)!.agents;
    if (!arr.includes(agentName)) arr.push(agentName);
  };
  for (const r of rows) {
    const name = r.agent.display_name ?? r.agent.name;
    for (const kb of r.resources.knowledgeFolders) push("kb", kb, name);
    for (const sk of r.resources.skills) push("skill", sk, name);
    for (const t of r.resources.tools) push("tool", t, name);
    for (const m of r.resources.mcpServers) push("mcp", m, name);
  }
  return [...map.values()].filter((d) => d.agents.length > 1);
}

// ────────────────────────────────────────────────────────────
// 图构造
// ────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<"kb" | "skill" | "tool" | "mcp" | "task", string> = {
  kb: "database",
  skill: "workflow",
  tool: "wrench",
  mcp: "plug",
  task: "network",
};

const CATEGORY_LABEL: Record<"kb" | "skill" | "tool" | "mcp" | "task", string> = {
  kb: "知识库",
  skill: "技能",
  tool: "工具",
  mcp: "MCP",
  task: "任务",
};

interface GraphBundle {
  nodes: RelationNode[];
  edges: RelationEdge[];
  height: number;
}

function buildGraph(rows: CollabRow[], duplicates: DuplicateItem[]): GraphBundle {
  if (rows.length === 0) return { nodes: [], edges: [], height: 480 };

  // 三列 x 坐标
  const X_ENTRY = 0;
  const X_AGENT = 280;
  const X_RESOURCE = 600;

  // y 间距
  const ENTRY_GAP = 80;
  const AGENT_GAP = 130;

  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];

  // 1) 入口节点:每个 bot 一个;按 agent 分组排列
  //    先按 agentId 把 bots 聚合,每组里 bots 紧凑堆叠
  type EntryRec = { bot: BotInfo; agentIndex: number };
  const entryRecs: EntryRec[] = [];
  rows.forEach((r, ai) => {
    for (const b of r.botEntries) entryRecs.push({ bot: b, agentIndex: ai });
  });

  // 计算 agent 行的 y 坐标(以 agent 为单位)
  const agentY = new Map<number, number>();
  let yCursor = 0;
  rows.forEach((_, ai) => {
    agentY.set(ai, yCursor);
    // 该 agent 的入口数决定下一行的下移量
    const entryCount = entryRecs.filter((e) => e.agentIndex === ai).length;
    const heightNeeded = Math.max(1, entryCount) * ENTRY_GAP;
    yCursor += Math.max(AGENT_GAP, heightNeeded);
  });
  const totalHeight = yCursor + 80;

  // 入口节点:同一 agent 的入口紧凑堆叠在 agent y 周围
  const entryNodeId = (b: BotInfo) => `entry-${b.id ?? b.name}`;
  const usedEntryIds = new Set<string>();

  rows.forEach((r, ai) => {
    const aY = agentY.get(ai)!;
    const bots = r.botEntries;
    const startY = aY - ((bots.length - 1) * ENTRY_GAP) / 2;
    bots.forEach((b, i) => {
      const id = entryNodeId(b);
      if (usedEntryIds.has(id)) return;
      usedEntryIds.add(id);
      const meta = platformMeta(b.platform);
      nodes.push({
        id,
        type: "relation",
        position: { x: X_ENTRY, y: startY + i * ENTRY_GAP },
        data: {
          kind: "entry",
          label: b.name,
          sublabel: `${meta.label} · 入口`,
          icon: meta.icon,
        } as RelationNodeData,
      });
    });
  });

  // 2) Agent 节点
  rows.forEach((r, ai) => {
    const id = `agent-${r.agent.id}`;
    const name = r.agent.display_name ?? r.agent.name;
    const role = r.agent.role_template ?? "general";
    const resourceCount =
      r.resources.knowledgeFolders.length +
      r.resources.skills.length +
      r.resources.tools.length +
      r.resources.mcpServers.length +
      r.pipelines.length;
    nodes.push({
      id,
      type: "relation",
      position: { x: X_AGENT, y: agentY.get(ai)! },
      data: {
        kind: "agent",
        label: name,
        sublabel: `${role} · ${resourceCount} 项资源 · ${r.botEntries.length} 入口`,
        icon: "bot",
      } as RelationNodeData,
    });

    // 边:入口 → agent
    for (const b of r.botEntries) {
      const eid = entryNodeId(b);
      if (!usedEntryIds.has(eid)) continue;
      edges.push({
        id: `e-${eid}-${id}`,
        source: eid,
        target: id,
      });
    }
  });

  // 3) 资源节点:按类别簇状聚合(同类资源合并为 1 个簇节点,带数量 badge)
  //    簇节点 hover title 看清单;不再逐个平铺,避免画布被拉长。
  const dupeKeySet = new Set(duplicates.map((d) => `${d.category}::${d.resource}`));
  void dupeKeySet;

  type ResItem = { key: string; category: "kb" | "skill" | "tool" | "mcp" | "task"; fromAgents: string[] };
  const resMap = new Map<string, ResItem>();
  const pushRes = (it: Omit<ResItem, "fromAgents">, agentId: string) => {
    const k = `${it.category}::${it.key}`;
    if (!resMap.has(k)) resMap.set(k, { ...it, fromAgents: [] });
    const arr = resMap.get(k)!.fromAgents;
    if (!arr.includes(agentId)) arr.push(agentId);
  };

  rows.forEach((r) => {
    for (const kb of r.resources.knowledgeFolders) pushRes({ key: kb, category: "kb" }, r.agent.id);
    for (const sk of r.resources.skills) pushRes({ key: sk, category: "skill" }, r.agent.id);
    for (const t of r.resources.tools) pushRes({ key: t, category: "tool" }, r.agent.id);
    for (const m of r.resources.mcpServers) pushRes({ key: m, category: "mcp" }, r.agent.id);
    for (const p of r.pipelines) pushRes({ key: p.name, category: "task" }, r.agent.id);
  });

  // 按类别聚合:每类 1 个簇节点
  const categoryOrder: ResItem["category"][] = ["kb", "task", "skill", "tool", "mcp"];
  const clustersByCat = new Map<ResItem["category"], { items: ResItem[]; agents: Set<string> }>();
  for (const cat of categoryOrder) clustersByCat.set(cat, { items: [], agents: new Set() });
  for (const it of resMap.values()) {
    clustersByCat.get(it.category)!.items.push(it);
    for (const a of it.fromAgents) clustersByCat.get(it.category)!.agents.add(a);
  }

  const CLUSTER_GAP = 100;
  const activeClusters = categoryOrder
    .map((cat) => ({ cat, data: clustersByCat.get(cat)! }))
    .filter((c) => c.data.items.length > 0);

  // 簇节点 y:以画布中部为中心向上下展开
  const clusterBlockHeight = activeClusters.length * CLUSTER_GAP;
  const centerY = totalHeight / 2;
  const clusterStartY = Math.max(20, centerY - clusterBlockHeight / 2);

  activeClusters.forEach((c, i) => {
    const id = `cluster-${c.cat}`;
    const count = c.data.items.length;
    const sharedCount = c.data.items.filter((it) => it.fromAgents.length > 1).length;
    const isAllShared = count > 0 && sharedCount === count;
    const names = c.data.items.map((it) => it.key);
    const preview = names.slice(0, 2).join("、") + (names.length > 2 ? ` 等 ${names.length} 项` : "");

    nodes.push({
      id,
      type: "relation",
      position: { x: X_RESOURCE, y: clusterStartY + i * CLUSTER_GAP },
      data: {
        kind: isAllShared ? "shared" : "resource",
        size: "lg",
        label: `${CATEGORY_LABEL[c.cat]} · ${count} 项`,
        sublabel: preview || "—",
        icon: CATEGORY_ICON[c.cat],
        category: c.cat,
        badge: sharedCount > 0 ? `共享 ${sharedCount}/${count}` : `×${count}`,
        items: names,
      } as RelationNodeData,
    });

    // 边:每条 = 簇内任一 agent → 簇节点(去重)
    const connectedAgents = new Set<string>();
    for (const it of c.data.items) {
      for (const aId of it.fromAgents) {
        if (connectedAgents.has(aId)) continue;
        connectedAgents.add(aId);
        const hasShared = c.data.items.some((x) => x.fromAgents.includes(aId) && x.fromAgents.length > 1);
        edges.push(
          hasShared
            ? dangerEdge({
                id: `e-agent-${aId}-${id}`,
                source: `agent-${aId}`,
                target: id,
              })
            : strongEdge({
                id: `e-agent-${aId}-${id}`,
                source: `agent-${aId}`,
                target: id,
              }),
        );
      }
    }
  });

  // R32-C 改动 ⑪:孤立 agent 检测 — 任何节点若无连线,补边确保"每个节点都有连线"。
  // 场景:某 agent 既无 bot 入口又无资源/任务,在画布上会变成孤点。
  // 做法:若存在孤立 agent,加一个"_unassigned"伪簇节点(灰色 · "未配置资源"),
  //       把每个孤立 agent 用 dashed 边连过去;伪簇只加一次。
  const wiredIds = new Set<string>();
  for (const e of edges) {
    wiredIds.add(e.source);
    wiredIds.add(e.target);
  }
  const orphanAgentIds: string[] = [];
  for (const n of nodes) {
    if (n.id.startsWith("agent-") && !wiredIds.has(n.id)) {
      orphanAgentIds.push(n.id);
    }
  }
  if (orphanAgentIds.length > 0) {
    const orphanNodeId = "cluster-unassigned";
    const orphanY = totalHeight + 40;
    nodes.push({
      id: orphanNodeId,
      type: "relation",
      position: { x: X_RESOURCE, y: orphanY },
      data: {
        kind: "resource",
        size: "lg",
        label: "未配置资源",
        sublabel: `${orphanAgentIds.length} 个数字员工待配置`,
        icon: "network",
        badge: `×${orphanAgentIds.length}`,
      } as RelationNodeData,
    });
    for (const aid of orphanAgentIds) {
      edges.push({
        id: `e-${aid}-${orphanNodeId}`,
        source: aid,
        target: orphanNodeId,
        data: { style: "dashed" },
      });
    }
  }

  const clusterHeight = clusterBlockHeight + 80 + (orphanAgentIds.length > 0 ? 120 : 0);
  const height = Math.max(480, Math.max(totalHeight, clusterHeight));
  return { nodes, edges, height };
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

export function CollaboratorsTab({ person }: { person: Person }) {
  const [rows, setRows] = React.useState<CollabRow[]>([]);
  const [duplicates, setDuplicates] = React.useState<DuplicateItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [bound, allPipelines, allBots] = await Promise.all([
        fetchPersonAgents(person.id),
        fetchPipelines(),
        fetchBots(),
      ]);
      const resourcesList = await Promise.all(bound.map((b) => fetchAgentResources(b.id)));

      // bots 按 agentId 索引(无 agentId 的略过)
      const botsByAgent = new Map<string, BotInfo[]>();
      for (const b of allBots) {
        if (!b.agentId) continue;
        if (!botsByAgent.has(b.agentId)) botsByAgent.set(b.agentId, []);
        botsByAgent.get(b.agentId)!.push(b);
      }

      const next: CollabRow[] = bound.map((agent, i) => {
        const resources = resourcesList[i];
        const pipelines = allPipelines.filter((p) => {
          const nodes = (p as unknown as { nodes?: Array<{ agentTemplateId?: string }> }).nodes;
          return Array.isArray(nodes) && nodes.some((n) => n?.agentTemplateId === agent.id);
        });
        const botEntries = botsByAgent.get(agent.id) ?? [];
        return { agent, resources, pipelines, botEntries };
      });

      if (cancelled) return;
      setRows(next);
      setDuplicates(detectDuplicates(next));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [person.id]);

  if (loading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }

  // 顶部统计(去重)
  const totalAgents = rows.length;
  const totalEntries = new Set(rows.flatMap((r) => r.botEntries.map((b) => b.id ?? b.name))).size;
  const totalChannels = new Set(rows.flatMap((r) => r.botEntries.map((b) => platformMeta(b.platform).label))).size;
  const totalKbs = new Set(rows.flatMap((r) => r.resources.knowledgeFolders)).size;
  const totalSkills = new Set(rows.flatMap((r) => r.resources.skills)).size;
  const totalTools = new Set(rows.flatMap((r) => r.resources.tools)).size;
  const totalMcp = new Set(rows.flatMap((r) => r.resources.mcpServers)).size;
  const totalTasks = new Set(rows.flatMap((r) => r.pipelines.map((p) => p.id))).size;

  const graph = buildGraph(rows, duplicates);

  return (
    <div className="space-y-5">
      {/* === 说明 === */}
      <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Info className="size-4 text-foreground/70" />
          <h4 className="font-medium text-[13px]">协作总览 · 关系总图(只读)</h4>
        </div>
        <p className="text-[12.5px] text-foreground/80 leading-relaxed">
          左侧入口(飞书/微信等平台的具体 bot)→ 中间该真人可调度的数字员工 → 右侧资源(知识库/技能/工具/MCP/任务)。
          红色高亮表示同一资源被多个数字员工共享。资源配置在各数字员工内部完成,这里只做汇总展示。
        </p>
      </div>

      {/* === 顶部统计 === */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Network className="size-4 text-foreground/70" />
          <h4 className="font-medium text-[13px]">规模统计</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <StatChip icon={Bot} label="数字员工" value={totalAgents} accent="text-violet-600 dark:text-violet-400" />
          <StatChip icon={MessageSquare} label="入口" value={totalEntries} accent="text-emerald-600 dark:text-emerald-400" />
          <StatChip icon={Radio} label="频道" value={totalChannels} accent="text-indigo-600 dark:text-indigo-400" />
          <StatChip icon={Database} label="知识库" value={totalKbs} accent="text-emerald-600 dark:text-emerald-400" />
          <StatChip icon={Workflow} label="任务" value={totalTasks} accent="text-sky-600 dark:text-sky-400" />
          <StatChip icon={Layers} label="技能" value={totalSkills} accent="text-amber-600 dark:text-amber-400" />
          <StatChip icon={Wrench} label="工具" value={totalTools} accent="text-rose-600 dark:text-rose-400" />
          <StatChip icon={Plug} label="MCP" value={totalMcp} accent="text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      {/* === 重复项警告 === */}
      {duplicates.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            <h4 className="font-medium text-[13px] text-amber-700 dark:text-amber-300">
              共享资源(被多个数字员工引用)
            </h4>
            <span className="ml-auto font-mono text-[11px] text-amber-700/80 dark:text-amber-300/80">
              {duplicates.length} 项
            </span>
          </div>
          <ul className="space-y-1.5 text-[12px] text-foreground/80">
            {duplicates.map((d) => (
              <li key={`${d.category}-${d.resource}`} className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 font-mono text-[10px] uppercase text-amber-700/70 dark:text-amber-300/70">
                  {CATEGORY_LABEL[d.category]}
                </span>
                <span className="flex-1">
                  <strong className="text-foreground/90">{d.resource}</strong>
                  <span className="ml-1.5 text-foreground/60">被</span>
                  <span className="mx-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">
                    {d.agents.join(" + ")}
                  </span>
                  共享
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* === 关系总图画布 === */}
      {totalAgents === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Bot className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">
            尚未关联数字员工。在【数字员工】tab 中为该真人添加可调度的数字员工。
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-2 text-[13px] font-medium">
              <Network className="size-4 text-foreground/65" />
              协作关系总图
            </h4>
            <div className="flex items-center gap-3 font-mono text-[10.5px] text-foreground/50">
              <LegendDot color="bg-emerald-500" label="入口" />
              <LegendDot color="bg-sky-500" label="数字员工" />
              <LegendDot color="bg-zinc-400" label="资源" />
              <LegendDot color="bg-rose-500" label="共享" />
            </div>
          </div>
          <RelationGraph
            nodes={graph.nodes}
            edges={graph.edges}
            height={graph.height}
            emptyHint="暂无关系数据"
          />
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 子组件
// ────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Bot;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background/50 px-3 py-2.5">
      <Icon className={cn("size-4 shrink-0", accent)} />
      <div className="min-w-0">
        <div className="text-[15px] font-semibold tabular-nums leading-none">{value}</div>
        <div className="text-[10.5px] text-muted-foreground mt-0.5">{label}</div>
      </div>
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

