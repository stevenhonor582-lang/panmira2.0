"use client";

/**
 * R26-A: 协作 tab — 关系总图(只读)
 *
 * 原 CollaboratorsTab 是 3 个配置入口(可调度数字员工/可访问知识库/可使用任务模板),
 * 概念冲突且重复(配置在各 agent 内部完成)。重做为「关系总图」:
 *
 *   真人 → 可调度 agent → 每个 agent 绑定的 KB/技能/工具/任务/接入渠道
 *
 * 纯只读展示,不做配置。重复项检测:同一 KB/技能被多个 agent 引用。
 *
 * 数据全部来自现有 API(无后端改动):
 *   - /api/v2/people/:id/agents       真人绑定的 agent(基础信息)
 *   - /api/v2/employees/:id           agent 详情(含 knowledge_folders/skills/tools)
 *   - /api/v2/admin/pipelines         任务列表(nodes[].agentTemplateId 反查关联 agent)
 *   - /api/bots                       bot 列表(name → platform,用于接入渠道)
 */

import * as React from "react";
import {
  Bot, Network, Database, Workflow, Wrench, Radio,
  ChevronDown, ChevronRight, AlertTriangle, Info, Layers,
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

// ────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────

interface AgentResources {
  knowledgeFolders: string[];
  skills: string[];
  tools: string[];
}

interface BotInfo {
  name: string;
  platform: string;
}

interface CollabRow {
  agent: PersonAgent;
  resources: AgentResources;
  pipelines: Pipeline[];
  channels: string[];
}

// ────────────────────────────────────────────────────────────
// 数据拉取
// ────────────────────────────────────────────────────────────

function fullPath(p: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE || "";
  if (!base) return p;
  if (p.startsWith("http")) return p;
  return base + p;
}

/** 拉 agent 详情(含 knowledge_folders/skills/tools) */
async function fetchAgentResources(id: string): Promise<AgentResources> {
  try {
    const res = await api<{ data?: Record<string, unknown> } | Record<string, unknown>>(
      fullPath(`/api/v2/employees/${id}`),
    );
    const row = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>);
    return {
      knowledgeFolders: Array.isArray(row?.knowledge_folders) ? (row.knowledge_folders as string[]) : [],
      skills: Array.isArray(row?.skills) ? (row.skills as string[]) : [],
      tools: Array.isArray(row?.tools) ? (row.tools as string[]) : [],
    };
  } catch {
    return { knowledgeFolders: [], skills: [], tools: [] };
  }
}

/** 拉 bot 列表 → name 到 platform 的映射 */
async function fetchBotMap(): Promise<Map<string, string>> {
  try {
    const res = await api<{ bots?: BotInfo[] } | BotInfo[]>(
      fullPath("/api/bots"),
    );
    const list = (res as { bots?: BotInfo[] })?.bots ?? (Array.isArray(res) ? (res as BotInfo[]) : []);
    const m = new Map<string, string>();
    for (const b of list) {
      if (b.name && b.platform) m.set(b.name, b.platform);
    }
    return m;
  } catch {
    return new Map();
  }
}

/** 平台代码 → 中文标签 */
function platformLabel(p: string): string {
  const map: Record<string, string> = {
    feishu: "飞书",
    dingtalk: "钉钉",
    wechatwork: "企业微信",
    slack: "Slack",
    telegram: "Telegram",
    web: "网页",
    api: "API",
  };
  return map[p] ?? p;
}

/** agent name → 接入渠道列表。网页是默认接入;bot_configs 匹配补平台。 */
function resolveChannels(agentName: string, botMap: Map<string, string>): string[] {
  const channels = ["网页"];
  const agentPrefix = agentName.replace(/--.*$/, "");
  for (const [botName, platform] of botMap) {
    if (agentName.startsWith(botName) || botName.startsWith(agentPrefix)) {
      const label = platformLabel(platform);
      if (!channels.includes(label)) channels.push(label);
    }
  }
  return channels;
}

// ────────────────────────────────────────────────────────────
// 重复项检测
// ────────────────────────────────────────────────────────────

interface DuplicateItem {
  resource: string;
  agents: string[];
}

interface Duplicates {
  kbs: DuplicateItem[];
  skills: DuplicateItem[];
  tools: DuplicateItem[];
}

function detectDuplicates(rows: CollabRow[]): Duplicates {
  const kbMap = new Map<string, string[]>();
  const skillMap = new Map<string, string[]>();
  const toolMap = new Map<string, string[]>();

  const push = (m: Map<string, string[]>, key: string, name: string) => {
    if (!m.has(key)) m.set(key, []);
    const arr = m.get(key)!;
    if (!arr.includes(name)) arr.push(name);
  };

  for (const r of rows) {
    const name = r.agent.display_name ?? r.agent.name;
    for (const kb of r.resources.knowledgeFolders) push(kbMap, kb, name);
    for (const sk of r.resources.skills) push(skillMap, sk, name);
    for (const t of r.resources.tools) push(toolMap, t, name);
  }

  const dupes = (m: Map<string, string[]>): DuplicateItem[] =>
    [...m.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([resource, agents]) => ({ resource, agents }));

  return { kbs: dupes(kbMap), skills: dupes(skillMap), tools: dupes(toolMap) };
}

// ────────────────────────────────────────────────────────────
// 主组件
// ────────────────────────────────────────────────────────────

export function CollaboratorsTab({ person }: { person: Person }) {
  const [rows, setRows] = React.useState<CollabRow[]>([]);
  const [duplicates, setDuplicates] = React.useState<Duplicates>({ kbs: [], skills: [], tools: [] });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [bound, allPipelines, botMap] = await Promise.all([
        fetchPersonAgents(person.id),
        fetchPipelines(),
        fetchBotMap(),
      ]);
      // 并发拉每个 agent 的资源详情
      const resourcesList = await Promise.all(bound.map((b) => fetchAgentResources(b.id)));

      const next: CollabRow[] = bound.map((agent, i) => {
        const resources = resourcesList[i];
        // 关联任务: pipeline 的 nodes 引用了该 agent
        const pipelines = allPipelines.filter((p) => {
          const nodes = (p as unknown as { nodes?: Array<{ agentTemplateId?: string }> }).nodes;
          return Array.isArray(nodes) && nodes.some((n) => n?.agentTemplateId === agent.id);
        });
        const channels = resolveChannels(agent.name, botMap);
        return { agent, resources, pipelines, channels };
      });

      if (cancelled) return;
      setRows(next);
      setDuplicates(detectDuplicates(next));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [person.id]);

  if (loading) {
    return <div className="h-48 rounded-2xl bg-muted/40 animate-pulse" />;
  }

  // ── 顶部统计聚合(去重) ──
  const totalKbs = new Set(rows.flatMap((r) => r.resources.knowledgeFolders)).size;
  const totalSkills = new Set(rows.flatMap((r) => r.resources.skills)).size;
  const totalTools = new Set(rows.flatMap((r) => r.resources.tools)).size;
  const totalPipelines = new Set(rows.flatMap((r) => r.pipelines.map((p) => p.id))).size;
  const totalChannels = new Set(rows.flatMap((r) => r.channels)).size;
  const hasDupes = duplicates.kbs.length + duplicates.skills.length + duplicates.tools.length > 0;

  return (
    <div className="space-y-5">
      {/* === 说明 === */}
      <div className="rounded-xl border border-foreground/15 bg-foreground/[0.03] p-4">
        <div className="flex items-center gap-2 mb-1.5">
          <Info className="size-4 text-foreground/70" />
          <h4 className="font-medium text-[13px]">协作总览(只读)</h4>
        </div>
        <p className="text-[12.5px] text-foreground/80">
          这里展示你能调度的数字员工及其绑定的资源。资源配置在各数字员工内部完成,这里只做汇总展示。
        </p>
      </div>

      {/* === 顶部统计 === */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Network className="size-4 text-foreground/70" />
          <h4 className="font-medium text-[13px]">协作总览</h4>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatChip icon={Bot} label="数字员工" value={rows.length} accent="text-violet-600 dark:text-violet-400" />
          <StatChip icon={Database} label="知识库" value={totalKbs} accent="text-emerald-600 dark:text-emerald-400" />
          <StatChip icon={Workflow} label="任务" value={totalPipelines} accent="text-sky-600 dark:text-sky-400" />
          <StatChip icon={Layers} label="技能" value={totalSkills} accent="text-amber-600 dark:text-amber-400" />
          <StatChip icon={Wrench} label="工具" value={totalTools} accent="text-rose-600 dark:text-rose-400" />
          <StatChip icon={Radio} label="接入渠道" value={totalChannels} accent="text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      {/* === 重复项警告 === */}
      {hasDupes && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            <h4 className="font-medium text-[13px] text-amber-700 dark:text-amber-300">共享资源</h4>
          </div>
          <ul className="space-y-1.5 text-[12px] text-foreground/80">
            {duplicates.kbs.map((d) => (
              <li key={`kb-${d.resource}`} className="flex items-start gap-2">
                <Database className="size-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span>
                  <strong className="text-foreground/90">&ldquo;{d.resource}&rdquo;</strong> 知识库 被{" "}
                  {d.agents.join(" + ")} 共享
                </span>
              </li>
            ))}
            {duplicates.skills.map((d) => (
              <li key={`sk-${d.resource}`} className="flex items-start gap-2">
                <Layers className="size-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  <strong className="text-foreground/90">&ldquo;{d.resource}&rdquo;</strong> 技能 被{" "}
                  {d.agents.join(" + ")} 共享
                </span>
              </li>
            ))}
            {duplicates.tools.map((d) => (
              <li key={`tl-${d.resource}`} className="flex items-start gap-2">
                <Wrench className="size-3.5 mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>
                  <strong className="text-foreground/90">&ldquo;{d.resource}&rdquo;</strong> 工具 被{" "}
                  {d.agents.join(" + ")} 共享
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* === 空状态 === */}
      {rows.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Bot className="size-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-[13px] text-muted-foreground">
            尚未关联数字员工。在【数字员工】tab 中为该真人添加可调度的数字员工。
          </p>
        </div>
      )}

      {/* === 每个 agent 的资源展开(折叠卡,默认折叠) === */}
      <div className="space-y-2.5">
        {rows.map((row) => (
          <AgentCollabCard key={row.agent.id} row={row} />
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 子组件
// ────────────────────────────────────────────────────────────

function StatChip({
  icon: Icon, label, value, accent,
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

function AgentCollabCard({ row }: { row: CollabRow }) {
  const [open, setOpen] = React.useState(false);
  const { agent, resources, pipelines, channels } = row;
  const name = agent.display_name ?? agent.name;
  const role = agent.role_template ?? "general";

  const kbCount = resources.knowledgeFolders.length;
  const skillCount = resources.skills.length;
  const toolCount = resources.tools.length;
  const taskCount = pipelines.length;
  const channelCount = channels.length;
  const totalRes = kbCount + skillCount + toolCount + taskCount;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* 折叠头 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="inline-flex items-center justify-center rounded-md bg-violet-500/10 p-1.5 shrink-0">
          <Bot className="size-4 text-violet-600 dark:text-violet-400" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-medium leading-tight">{name}</span>
            <code className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {role}
            </code>
          </div>
          <div className="text-[10.5px] text-muted-foreground mt-0.5 font-mono tabular-nums">
            {totalRes} 项资源 · {channelCount} 接入
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {channels.map((c) => (
            <span
              key={c}
              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-foreground/70"
            >
              <Radio className="size-2.5" />
              {c}
            </span>
          ))}
        </div>
      </button>

      {/* 展开内容 */}
      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2.5 bg-muted/10">
          <ResourceLine
            icon={Database}
            label="知识库"
            count={kbCount}
            items={resources.knowledgeFolders}
            accent="text-emerald-600 dark:text-emerald-400"
            emptyHint="未绑定知识库"
          />
          <ResourceLine
            icon={Workflow}
            label="任务"
            count={taskCount}
            items={pipelines.map((p) => p.name)}
            accent="text-sky-600 dark:text-sky-400"
            emptyHint="未关联任务"
          />
          <ResourceLine
            icon={Layers}
            label="技能"
            count={skillCount}
            items={resources.skills}
            accent="text-amber-600 dark:text-amber-400"
            emptyHint="未配置技能"
          />
          <ResourceLine
            icon={Wrench}
            label="工具"
            count={toolCount}
            items={resources.tools}
            accent="text-rose-600 dark:text-rose-400"
            emptyHint="未配置工具"
          />
          <ResourceLine
            icon={Radio}
            label="接入"
            count={channelCount}
            items={channels}
            accent="text-indigo-600 dark:text-indigo-400"
            emptyHint="未接入"
            showCount={false}
          />
        </div>
      )}
    </div>
  );
}

function ResourceLine({
  icon: Icon, label, count, items, accent, emptyHint, showCount = true,
}: {
  icon: typeof Bot;
  label: string;
  count: number;
  items: string[];
  accent: string;
  emptyHint: string;
  showCount?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className={cn("size-3.5 mt-1 shrink-0", accent)} />
      <div className="flex-1 min-w-0">
        <span className="text-[11px] text-muted-foreground mr-1.5">
          {label}{showCount && count > 0 ? `(${count})` : ""}:
        </span>
        {items.length === 0 ? (
          <span className="text-[11px] text-muted-foreground/60 italic">{emptyHint}</span>
        ) : (
          <span className="text-[11.5px] text-foreground/80 leading-relaxed">
            {items.join(" · ")}
          </span>
        )}
      </div>
    </div>
  );
}
