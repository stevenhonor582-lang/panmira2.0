/**
 * R13-D: DAG connection rules + cycle detection.
 * Pure functions, no React. Used by the editor and the test-run pre-flight.
 */

import type { DagEdgeRecord, NodeKind } from "./types";

/** Allowed downstream kinds for each source kind. */
const ALLOWED_DOWNSTREAM: Record<NodeKind, NodeKind[]> = {
  bot: ["skill", "tool", "bot", "human", "conditional", "parallel"],
  human: ["skill", "tool", "bot", "conditional", "parallel"],
  skill: ["bot", "skill", "tool", "human", "conditional", "parallel"],
  tool: ["bot", "skill", "tool", "human", "conditional", "parallel"],
  conditional: ["bot", "skill", "tool", "human", "conditional", "parallel"],
  parallel: ["bot", "skill", "tool", "human", "conditional", "parallel"],
};

export function isConnectionAllowed(from: NodeKind, to: NodeKind): boolean {
  if (from === to && from !== "parallel") {
    // self-loop on same kind allowed only for parallel fan-out
  }
  return ALLOWED_DOWNSTREAM[from]?.includes(to) ?? false;
}

/** Conditional must have ≥2 out-edges; Parallel out-edges must equal parallelism. */
export interface NodeRuleViolation {
  shapeId: string;
  kind: NodeKind;
  rule: "conditional_two_branches" | "parallel_degree" | "no_outgoing" | "no_incoming" | "duplicate_edge";
  message: string;
}

export function validateEdgeRules(
  nodes: Array<{ shapeId: string; kind: NodeKind }>,
  edges: DagEdgeRecord[],
  parallelism: Record<string, number> = {},
): NodeRuleViolation[] {
  const out: NodeRuleViolation[] = [];
  const outCount = new Map<string, number>();
  const inCount = new Map<string, number>();
  const seen = new Set<string>();
  for (const e of edges) {
    outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
    inCount.set(e.to, (inCount.get(e.to) ?? 0) + 1);
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) {
      out.push({ shapeId: e.from, kind: "tool", rule: "duplicate_edge", message: "重复连线" });
    }
    seen.add(key);
  }
  for (const n of nodes) {
    const o = outCount.get(n.shapeId) ?? 0;
    const i = inCount.get(n.shapeId) ?? 0;
    if (n.kind === "conditional" && o < 2 && o > 0) {
      out.push({
        shapeId: n.shapeId,
        kind: n.kind,
        rule: "conditional_two_branches",
        message: "条件节点需要至少 2 条出边(if/else)",
      });
    }
    if (n.kind === "parallel") {
      const want = parallelism[n.shapeId] ?? 2;
      if (o > 0 && o !== want) {
        out.push({
          shapeId: n.shapeId,
          kind: n.kind,
          rule: "parallel_degree",
          message: `并行节点出边数(${o})与并行度(${want})不一致`,
        });
      }
    }
    // Skip source/sink check for singleton graphs
    if (nodes.length > 1) {
      if (o === 0 && i === 0) {
        out.push({
          shapeId: n.shapeId,
          kind: n.kind,
          rule: "no_incoming",
          message: "孤立节点(无进出边)",
        });
      }
    }
  }
  return out;
}

/** Cycle detection via DFS. Returns the first cycle's shape ids, or null if acyclic. */
export function detectCycle(
  nodes: Array<{ shapeId: string }>,
  edges: DagEdgeRecord[],
): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.shapeId, []);
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.shapeId, WHITE);
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    color.set(id, GRAY);
    stack.push(id);
    for (const next of adj.get(id) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        return stack.slice(idx).concat(next);
      }
      if (c === WHITE) {
        const r = visit(next);
        if (r) return r;
      }
    }
    color.set(id, BLACK);
    stack.pop();
    return null;
  };

  for (const n of nodes) {
    if (color.get(n.shapeId) === WHITE) {
      const r = visit(n.shapeId);
      if (r) return r;
    }
  }
  return null;
}

export interface ValidationResult {
  ok: boolean;
  cycle: string[] | null;
  violations: NodeRuleViolation[];
  /** Human-readable summary for a banner. */
  summary: string;
}

export function validateDag(
  nodes: Array<{ shapeId: string; kind: NodeKind }>,
  edges: DagEdgeRecord[],
  parallelism: Record<string, number> = {},
): ValidationResult {
  const cycle = detectCycle(nodes, edges);
  const violations = validateEdgeRules(nodes, edges, parallelism);
  const ok = !cycle && violations.length === 0;
  let summary = "DAG 校验通过";
  if (cycle) summary = `检测到环: ${cycle.join(" → ")}`;
  else if (violations.length > 0) summary = violations[0].message;
  return { ok, cycle, violations, summary };
}

// ──────────────────────────────────────────────────────────────────────────
// Cron helpers — R13-D scheduled tasks deepening
// ──────────────────────────────────────────────────────────────────────────

const CRON_FIELD_LABELS = [
  "分钟 (0-59)",
  "小时 (0-23)",
  "日 (1-31)",
  "月 (1-12 或 JAN-DEC)",
  "周 (0-6 或 SUN-SAT)",
];

/** Parse cron → human-readable Chinese summary. Best-effort, no full parser. */
export function describeCron(expr: string | undefined): string {
  if (!expr || !expr.trim()) return "未配置";
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return `无效格式 · 期望 5 段`;
  const [m, h, dom, mon, dow] = parts;
  if (m === "*" && h === "*") return "每分钟";
  if (m === "0" && h === "*") return "每小时整点";
  if (m === "0" && /^\d+$/.test(h)) return `每天 ${pad2(h)}:00`;
  if (m === "0" && h === "9") return "每个工作日 09:00 (近似)";
  if (m === "30" && h === "8") return "每天 08:30";
  if (m.startsWith("*/")) return `每 ${m.slice(2)} 分钟`;
  if (h.startsWith("*/")) return `每 ${h.slice(2)} 小时`;
  return `${pad2(h)}:${pad2(m)} · 月-${mon} · 日-${dom} · 周-${dow}`;
}

function pad2(s: string): string {
  return s.padStart(2, "0");
}

/** Predict next 3 run timestamps. Returns ISO strings; minimal heuristic. */
export function previewNextRuns(expr: string, base = Date.now(), n = 3): string[] {
  const out: string[] = [];
  const parts = (expr || "").trim().split(/\s+/);
  if (parts.length !== 5) return out;
  const [m, h] = parts;
  // Support a few common patterns; otherwise return empty.
  let stepMs = 0;
  if (m === "*" && h === "*") stepMs = 60_000;
  else if (m.startsWith("*/")) stepMs = Number(m.slice(2)) * 60_000;
  else if (h.startsWith("*/")) stepMs = Number(h.slice(2)) * 3_600_000;
  else if (m === "0" && /^\d+$/.test(h)) {
    // Daily at h:00 — step 24h
    stepMs = 24 * 3_600_000;
    const d = new Date(base);
    d.setHours(Number(h), 0, 0, 0);
    if (d.getTime() < base) d.setDate(d.getDate() + 1);
    let t = d.getTime();
    for (let i = 0; i < n; i++) {
      out.push(new Date(t).toISOString());
      t += stepMs;
    }
    return out;
  } else {
    return out;
  }
  let t = base;
  for (let i = 0; i < n; i++) {
    t += stepMs;
    out.push(new Date(t).toISOString());
  }
  return out;
}

export const CRON_PRESETS: Array<{ label: string; expr: string }> = [
  { label: "每分钟", expr: "* * * * *" },
  { label: "每 5 分钟", expr: "*/5 * * * *" },
  { label: "每小时整点", expr: "0 * * * *" },
  { label: "每天 09:00", expr: "0 9 * * *" },
  { label: "每天 18:30", expr: "30 18 * * *" },
  { label: "工作日 09:00", expr: "0 9 * * 1-5" },
];

export { CRON_FIELD_LABELS };
