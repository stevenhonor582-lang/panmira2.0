"use client";

/**
 * R33-B: 真人协作关系图(画布版)。
 *
 * R33-B 核心修复(用户原话 ④⑭):
 *   - 中心 = 真人本体(person kind,琥珀色大节点,居中,永不消失)。
 *   - 四列布局:
 *       入口(bot) → 真人本体 → 数字员工 → 资源簇
 *   - 所有节点必须有连线指向中心或经中心:
 *       入口 → 真人本体(琥珀色加粗)
 *       真人本体 → 数字员工(紫色加粗)
 *       数字员工 → 资源簇(普通/红色共享/虚线)
 *   - 自检重绘:edges=0 时触发 onEmptyEdges 重算。
 *   - 真人本体永不消失:即使无 agent / 无入口,本体节点也存在,接 dashed 边到空状态提示。
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
  AlertTriangle, Info, Radio, Plug, MessageSquare, User2,
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
  dashedEdge,
  personEdge,
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

async function fetchAgentResources(id: string): Promise<AgentResources> {
  try {
    const res = await api<{ data?: Record<string, unknown> } | Record<string, unknown>>(
      fullPath(`/api/v2/employees/${id}`),
    );
    const row =
      (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>);
    const arr = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
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

async function fetchBots(): Promise<BotInfo[]> {
  try {
    const res = await api<{ bots?: BotInfo[] } | BotInfo[]>(fullPath("/api/bots"));
    const list =
      (res as { bots?: BotInfo[] })?.bots ?? (Array.isArray(res) ? (res as BotInfo[]) : []);
    return list.filter((b) => b && b.name && b.platform);
  } catch {
    return [];
  }
}

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
// 图构造(R33-B 四列布局)
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

/** R33-B: 中心节点 ID 常量,所有汇聚连线的终点 */
const PERSON_NODE_ID = "person-self";

function buildGraph(person: Person, rows: CollabRow[]): GraphBundle {
  const nodes: RelationNode[] = [];
  const edges: RelationEdge[] = [];

  // 四列 x 坐标
  const X_ENTRY = 0;
  const X_PERSON = 320;
  const X_AGENT = 640;
  const X_RES = 940;

  // 间距
  const AGENT_GAP = 130;
  const ENTRY_GAP = 80;
  const CLUSTER_GAP = 100;

  // ────────────────────────────────────────────────────────
  // 边界情况:无数字员工 — 真人本体依然要显示(永不消失)
  // ────────────────────────────────────────────────────────
  if (rows.length === 0) {
    nodes.push({
      id: PERSON_NODE_ID,
      type: "relation",
      position: { x: X_PERSON, y: 40 },
      data: {
        kind: "person",
        size: "lg",
        label: person.name,
        sublabel: `${person.role || "真人"} · 尚未关联数字员工`,
        icon: "user",
        badge: "本人",
      } as RelationNodeData,
    });
    const emptyId = "cluster-empty";
    nodes.push({
      id: emptyId,
      type: "relation",
      position: { x: X_AGENT, y: 40 },
      data: {
        kind: "resource",
        size: "lg",
        label: "未关联数字员工",
        sublabel: "在「数字员工」tab 添加",
        icon: "bot",
      } as RelationNodeData,
    });
    edges.push(
      dashedEdge({
        id: `e-${PERSON_NODE_ID}-${emptyId}`,
        source: PERSON_NODE_ID,
        target: emptyId,
      }),
    );
    return { nodes, edges, height: 440 };
  }

  // ────────────────────────────────────────────────────────
  // 计算 y 坐标:真人本体居中,agent 围绕排列
  // ────────────────────────────────────────────────────────
  const agentCount = rows.length;
  const totalAgentHeight = agentCount * AGENT_GAP;
  const centerY = totalAgentHeight / 2;

  // 1) 真人本体(中心,大金色节点)
  nodes.push({
    id: PERSON_NODE_ID,
    type: "relation",
    position: { x: X_PERSON, y: centerY },
    data: {
      kind: "person",
      size: "lg",
      label: person.name,
      sublabel: `${person.role || "真人"} · ${agentCount} 个数字员工`,
      icon: "user",
      badge: "本人",
    } as RelationNodeData,
  });

  // 2) 入口节点(左列)+ 入口 → 真人本体(personEdge 琥珀色)
  const entryNodeId = (b: BotInfo) => `entry-${b.id ?? b.name}`;
  const usedEntryIds = new Set<string>();

  rows.forEach((r, ai) => {
    const bots = r.botEntries;
    if (bots.length === 0) return;
    const aY = ai * AGENT_GAP;
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
      // R33-B 边:入口 → 真人本体(琥珀色加粗,强调"指向真人主体")
      edges.push(
        personEdge({
          id: `e-${id}-${PERSON_NODE_ID}`,
          source: id,
          target: PERSON_NODE_ID,
        }),
      );
    });
  });

  // 3) 数字员工节点(中右列)+ 真人本体 → 数字员工(strongEdge 紫色)
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
      position: { x: X_AGENT, y: ai * AGENT_GAP },
      data: {
        kind: "agent",
        label: name,
        sublabel: `${role} · ${resourceCount} 项资源 · ${r.botEntries.length} 入口`,
        icon: "bot",
      } as RelationNodeData,
    });
    // R33-B 边:真人本体 → 数字员工(紫色加粗)
    edges.push(
      strongEdge({
        id: `e-${PERSON_NODE_ID}-${id}`,
        source: PERSON_NODE_ID,
        target: id,
      }),
    );
  });

  // 4) 资源簇节点(最右列,按类别聚合所有 agent 的资源)
  type ResItem = {
    key: string;
    category: "kb" | "skill" | "tool" | "mcp" | "task";
    fromAgents: string[];
  };
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

  const categoryOrder: ResItem["category"][] = ["kb", "task", "skill", "tool", "mcp"];
  const clustersByCat = new Map<ResItem["category"], { items: ResItem[]; agents: Set<string> }>();
  for (const cat of categoryOrder) clustersByCat.set(cat, { items: [], agents: new Set() });
  for (const it of resMap.values()) {
    clustersByCat.get(it.category)!.items.push(it);
    for (const a of it.fromAgents) clustersByCat.get(it.category)!.agents.add(a);
  }

  const activeClusters = categoryOrder
    .map((cat) => ({ cat, data: clustersByCat.get(cat)! }))
    .filter((c) => c.data.items.length > 0);

  // 簇节点 y:整体居中
  const clusterBlockHeight = activeClusters.length * CLUSTER_GAP;
  const clusterStartY = Math.max(20, centerY - clusterBlockHeight / 2);

  activeClusters.forEach((c, i) => {
    const id = `cluster-${c.cat}`;
    const count = c.data.items.length;
    const sharedCount = c.data.items.filter((it) => it.fromAgents.length > 1).length;
    const isAllShared = count > 0 && sharedCount === count;
    const names = c.data.items.map((it) => it.key);
    const preview =
      names.slice(0, 2).join("、") + (names.length > 2 ? ` 等 ${names.length} 项` : "");

    nodes.push({
      id,
      type: "relation",
      position: { x: X_RES, y: clusterStartY + i * CLUSTER_GAP },
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

    // R33-B 边:每个拥有该簇资源的 agent → 簇节点(去重;共享用红色)
    const connectedAgents = new Set<string>();
    for (const it of c.data.items) {
      for (const aId of it.fromAgents) {
        if (connectedAgents.has(aId)) continue;
        connectedAgents.add(aId);
        const hasShared = c.data.items.some(
          (x) => x.fromAgents.includes(aId) && x.fromAgents.length > 1,
        );
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

  // ────────────────────────────────────────────────────────
  // R33-B 防御性兜底:扫描所有节点,任何孤点(无连线)补一条 dashed 边。
  // 确保画布上"每个节点都有连线",杜绝孤点漂浮。
  // ────────────────────────────────────────────────────────
  const wiredIds = new Set<string>();
  for (const e of edges) {
    wiredIds.add(e.source);
    wiredIds.add(e.target);
  }
  for (const n of nodes) {
    if (!wiredIds.has(n.id) && n.id !== PERSON_NODE_ID) {
      edges.push(
        dashedEdge({
          id: `e-${PERSON_NODE_ID}-orphan-${n.id}`,
          source: PERSON_NODE_ID,
          target: n.id,
        }),
      );
    }
  }

  const height = Math.max(480, totalAgentHeight + 120, clusterBlockHeight + 120);
  return { nodes, edges, height };
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

export function CollaboratorsTab({ person }: { person: Person }) {
  const [rows, setRows] = React.useState<CollabRow[]>([]);
  const [duplicates, setDuplicates] = React.useState<DuplicateItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  // R33-B:自检重绘计数器 — edges=0 时 +1 触发 buildGraph 重算(下一次渲染)
  const [rebuildTick, setRebuildTick] = React.useState(0);
  const rebuild = React.useCallback(() => setRebuildTick((t) => t + 1), []);

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

  // R33-B:buildGraph 用 useMemo 缓存(rebuildTick 强制重算)。
  // 关键:useMemo 必须在 if(loading) return 之前,否则 hooks 顺序不一致 → React error #310。
  const graph = React.useMemo(
    () => buildGraph(person, rows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [person, rows, rebuildTick],
  );

  if (loading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }

  const totalAgents = rows.length;
  const totalEntries = new Set(rows.flatMap((r) => r.botEntries.map((b) => b.id ?? b.name))).size;
  const totalChannels = new Set(
    rows.flatMap((r) => r.botEntries.map((b) => platformMeta(b.platform).label)),
  ).size;
  const totalKbs = new Set(rows.flatMap((r) => r.resources.knowledgeFolders)).size;
  const totalSkills = new Set(rows.flatMap((r) => r.resources.skills)).size;
  const totalTools = new Set(rows.flatMap((r) => r.resources.tools)).size;
  const totalMcp = new Set(rows.flatMap((r) => r.resources.mcpServers)).size;
  const totalTasks = new Set(rows.flatMap((r) => r.pipelines.map((p) => p.id))).size;

  return (
    <div className="space-y-5">
      {/* === 说明 === */}
      <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Info className="size-4 text-foreground/70" />
          <h4 className="font-medium text-[13px]">协作总览 · 关系总图(只读)</h4>
        </div>
        <p className="text-[12.5px] text-foreground/80 leading-relaxed">
          中心为<strong className="mx-0.5 text-amber-700 dark:text-amber-300">真人本体</strong>
          。左侧入口(bot)→ 中心真人 → 数字员工 → 右侧资源(知识库/技能/工具/MCP/任务),所有关系汇聚向中心。
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
          <StatChip icon={User2} label="真人" value={1} accent="text-amber-600 dark:text-amber-400" />
          <StatChip icon={Bot} label="数字员工" value={totalAgents} accent="text-violet-600 dark:text-violet-400" />
          <StatChip icon={MessageSquare} label="入口" value={totalEntries} accent="text-emerald-600 dark:text-emerald-400" />
          <StatChip icon={Radio} label="频道" value={totalChannels} accent="text-indigo-600 dark:text-indigo-400" />
          <StatChip icon={Database} label="知识库" value={totalKbs} accent="text-emerald-600 dark:text-emerald-400" />
          <StatChip icon={Workflow} label="任务" value={totalTasks} accent="text-sky-600 dark:text-sky-400" />
          <StatChip icon={Layers} label="技能" value={totalSkills} accent="text-amber-600 dark:text-amber-400" />
          <StatChip icon={Wrench} label="工具" value={totalTools} accent="text-rose-600 dark:text-rose-400" />
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

      {/* === 关系总图画布(R33-B 中心 = 真人本体,永不消失) === */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-[13px] font-medium">
            <Network className="size-4 text-foreground/65" />
            协作关系总图
            <span className="ml-2 font-mono text-[10.5px] font-normal text-foreground/50">
              中心 = {person.name}
            </span>
          </h4>
          <div className="flex items-center gap-3 font-mono text-[10.5px] text-foreground/50">
            <LegendDot color="bg-amber-500" label="真人本体" />
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
          onEmptyEdges={rebuild}
        />
      </div>
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
