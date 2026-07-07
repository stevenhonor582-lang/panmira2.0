// 5 bot default pipeline templates — one per bot 史德飞 uses.
// Each returns an array of nodes (with positions) and edges (shape id pairs).
// The editor will translate these into tldraw shape records at insert-time.

import type { DagDocument, DagEdgeRecord, DagNodeMeta } from "./types";

export interface TemplateNode {
  meta: DagNodeMeta;
  /** Canvas position. */
  x: number;
  y: number;
}

export interface TemplateEdge {
  from: number;
  to: number;
}

export interface DagTemplate {
  /** Stable id (e.g. bot handle). */
  id: string;
  /** Display name in the picker. */
  name: string;
  /** One-line description. */
  description: string;
  /** The owning bot handle (matches /api/v1/agent/bots entries). */
  botId: string;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
}

/** 5 史德飞-curated bot templates. Each has 4-6 nodes with realistic flow. */
export const DAG_TEMPLATES: DagTemplate[] = [
  {
    id: "tpl-buyer-discovery",
    name: "采购线索发现",
    description: "不盈 · 海康/大华询盘 → 行业归类 → 询价",
    botId: "buyer-discovery",
    nodes: [
      { meta: { kind: "bot", label: "不盈 · 监控", refId: "buyer-discovery" }, x: 200, y: 200 },
      { meta: { kind: "tool", label: "提取询盘关键词" }, x: 520, y: 200 },
      { meta: { kind: "skill", label: "行业归类" }, x: 840, y: 200 },
      { meta: { kind: "conditional", label: "高价值?" }, x: 1160, y: 200 },
      { meta: { kind: "human", label: "史德飞审批", refId: "metmira:admin" }, x: 1480, y: 80 },
      { meta: { kind: "bot", label: "信言 · 自动询价", refId: "outreach" }, x: 1480, y: 320 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 3, to: 5 },
    ],
  },
  {
    id: "tpl-quote-orchestrator",
    name: "报价单编排",
    description: "得一 · 多供应商比价 → 价格汇总 → 客户报价",
    botId: "quote-orchestrator",
    nodes: [
      { meta: { kind: "bot", label: "得一 · 调度", refId: "quote-orchestrator" }, x: 200, y: 240 },
      { meta: { kind: "parallel", label: "并行询价" }, x: 520, y: 240 },
      { meta: { kind: "tool", label: "供应商 A 价格" }, x: 840, y: 100 },
      { meta: { kind: "tool", label: "供应商 B 价格" }, x: 840, y: 240 },
      { meta: { kind: "tool", label: "供应商 C 价格" }, x: 840, y: 380 },
      { meta: { kind: "skill", label: "汇率 + 关税" }, x: 1160, y: 240 },
      { meta: { kind: "human", label: "客户经理确认" }, x: 1480, y: 240 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 1, to: 3 },
      { from: 1, to: 4 },
      { from: 2, to: 5 },
      { from: 3, to: 5 },
      { from: 4, to: 5 },
      { from: 5, to: 6 },
    ],
  },
  {
    id: "tpl-supplier-onboarding",
    name: "供应商入驻",
    description: "守静 · 1688 / 工厂背景调查 → 合规校验 → 入库",
    botId: "supplier-onboarding",
    nodes: [
      { meta: { kind: "bot", label: "守静 · 入驻", refId: "supplier-onboarding" }, x: 200, y: 200 },
      { meta: { kind: "tool", label: "抓取 1688 主页" }, x: 520, y: 200 },
      { meta: { kind: "tool", label: "天眼查背景" }, x: 840, y: 200 },
      { meta: { kind: "skill", label: "合规校验" }, x: 1160, y: 200 },
      { meta: { kind: "conditional", label: "是否通过" }, x: 1480, y: 200 },
      { meta: { kind: "human", label: "运营复核" }, x: 1800, y: 80 },
      { meta: { kind: "bot", label: "信言 · 入库通知", refId: "outreach" }, x: 1800, y: 320 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 4, to: 5 },
      { from: 4, to: 6 },
    ],
  },
  {
    id: "tpl-content-blast",
    name: "多渠道内容投放",
    description: "墨言 · 一稿 → 多平台改写 → 飞书/邮件/LinkedIn",
    botId: "content-blast",
    nodes: [
      { meta: { kind: "bot", label: "墨言 · 创作", refId: "content-blast" }, x: 200, y: 200 },
      { meta: { kind: "skill", label: "长文改写" }, x: 520, y: 200 },
      { meta: { kind: "parallel", label: "渠道分发" }, x: 840, y: 200 },
      { meta: { kind: "tool", label: "飞书推送" }, x: 1160, y: 80 },
      { meta: { kind: "tool", label: "邮件群发" }, x: 1160, y: 200 },
      { meta: { kind: "tool", label: "LinkedIn" }, x: 1160, y: 320 },
      { meta: { kind: "human", label: "运营 review" }, x: 1480, y: 200 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 2, to: 4 },
      { from: 2, to: 5 },
      { from: 2, to: 6 },
    ],
  },
  {
    id: "tpl-incident-triage",
    name: "事故分诊",
    description: "玄鉴 · 异常检测 → 严重度 → oncall 派单",
    botId: "incident-triage",
    nodes: [
      { meta: { kind: "bot", label: "玄鉴 · 监测", refId: "incident-triage" }, x: 200, y: 200 },
      { meta: { kind: "tool", label: "日志采样" }, x: 520, y: 200 },
      { meta: { kind: "skill", label: "严重度评估" }, x: 840, y: 200 },
      { meta: { kind: "conditional", label: "P0/P1?" }, x: 1160, y: 200 },
      { meta: { kind: "human", label: "史德飞 oncall" }, x: 1480, y: 80 },
      { meta: { kind: "bot", label: "墨言 · 自动通知", refId: "content-blast" }, x: 1480, y: 320 },
    ],
    edges: [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
      { from: 3, to: 5 },
    ],
  },
];

/** Build a DagDocument from a template (without tldraw snapshot — set later). */
export function templateToEmptyDoc(t: DagTemplate): DagDocument {
  return {
    snapshot: null,
    nodes: [],
    edges: [],
    botId: t.botId,
  };
}