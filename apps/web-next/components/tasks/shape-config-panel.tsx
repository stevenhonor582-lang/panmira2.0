"use client";

/**
 * R13-D: Per-shape configuration panel.
 *
 * Renders different forms based on the selected node's kind:
 *   - bot: agent picker (from /api/v2/employees)
 *   - human: user picker (from /api/v2/employees/people or admin/users)
 *   - skill: skill picker (graceful empty state — skill store is filesystem-side)
 *   - tool: tool name + config JSON
 *   - conditional: condition expression
 *   - parallel: parallelism degree
 */

import * as React from "react";
import { Bot, Trash2, UserRound, Wrench, Hammer, GitFork, Split, type LucideIcon } from "lucide-react";

import type { ApprovalState, DagNodeMeta, NodeKind } from "./types";
import { NODE_KIND_CONTRACTS, NODE_KIND_MAP } from "./types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Option {
  id: string;
  label: string;
  sub?: string;
}

function extractList<T>(r: unknown): T[] {
  if (!r || typeof r !== 'object') return [];
  const data = (r as { data?: unknown }).data;
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
  }
  return [];
}

interface ShapeConfigPanelProps {
  meta: DagNodeMeta;
  onChange: (patch: Partial<DagNodeMeta>) => void;
  onDelete?: () => void;
}

export function ShapeConfigPanel({ meta, onChange, onDelete }: ShapeConfigPanelProps) {
  const kind = meta.kind;
  const M = NODE_KIND_MAP[kind];
  const Icon = ICON_MAP[kind];

  return (
    <div className="h-full rounded-lg bg-card ring-1 ring-foreground/15 shadow-[0_8px_30px_-12px_rgba(15,23,42,0.25)] flex flex-col overflow-hidden">
      <div className="h-1.5 w-full" style={{ backgroundColor: M.tone }} />
      <div className="px-3 py-2.5 border-b">
        <div className="flex items-center gap-2">
          <span
            className="grid place-items-center size-7 rounded-md"
            style={{ backgroundColor: `${M.tone}22`, color: M.tone }}
          >
            <Icon className="size-4" strokeWidth={2} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {M.label} 配置
            </div>
            <input
              value={meta.label ?? ""}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="节点名称"
              className="w-full mt-0.5 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-foreground/30"
            />
          </div>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="删除节点"
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {kind === "bot" && <BotConfig meta={meta} onChange={onChange} />}
        {kind === "human" && <HumanConfig meta={meta} onChange={onChange} />}
        {kind === "skill" && <SkillConfig meta={meta} onChange={onChange} />}
        {kind === "tool" && <ToolConfig meta={meta} onChange={onChange} />}
        {kind === "conditional" && <ConditionalConfig meta={meta} onChange={onChange} />}
        {kind === "parallel" && <ParallelConfig meta={meta} onChange={onChange} />}
        {kind === "human" && <HumanApprovalCard meta={meta} onChange={onChange} />}
        <IOContractCard kind={kind} />
      </div>
    </div>
  );
}

// ── Bot ────────────────────────────────────────────────────────────────────

function BotConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  const [opts, setOpts] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        const r = await api("/api/v2/employees?limit=100");
        const list = extractList<{ id: string; name?: string; display_name?: string; description?: string }>(r).map((a) => ({
          id: a.id,
          label: a.display_name || a.name || a.id,
          sub: a.description,
        }));
        setOpts(list);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "加载员工失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return (
    <Picker
      title="选择数字员工"
      loading={loading}
      error={err}
      options={opts}
      selectedId={meta.refId}
      onSelect={(id, label) => onChange({ refId: id, label })}
    />
  );
}

// ── Human ─────────────────────────────────────────────────────────────────

function HumanConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  const [opts, setOpts] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        // /api/v2/people is the canonical user list (IA v6)
        const r = await api("/api/v2/people?limit=50");
        const list = extractList<{ id: string; name?: string; email?: string; department?: string }>(r).map((u) => ({
          id: u.id,
          label: u.name || u.email || u.id,
          sub: u.department || u.email,
        }));
        setOpts(list);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "加载人员失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return (
    <Picker
      title="选择负责人"
      loading={loading}
      error={err}
      options={opts}
      selectedId={meta.refId}
      onSelect={(id, label) => onChange({ refId: id, label })}
    />
  );
}

// ── Skill ─────────────────────────────────────────────────────────────────

function SkillConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  const [opts, setOpts] = React.useState<Option[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        // Skill hub is filesystem-backed; the v2 endpoint may return empty.
        // Fall back to a sensible default set so the editor is always usable.
        const r = await api("/api/v2/admin/skill-dags?limit=200");
        const list = extractList<{ id: string; name?: string; description?: string }>(r).map((sk) => ({
          id: sk.id,
          label: sk.name || sk.id,
          sub: sk.description,
        }));
        if (list.length === 0) {
          setOpts(FALLBACK_SKILLS);
        } else {
          setOpts(list);
        }
      } catch {
        setOpts(FALLBACK_SKILLS);
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  return (
    <Picker
      title="选择能力 (skill)"
      loading={loading}
      error={err}
      options={opts}
      selectedId={meta.refId}
      onSelect={(id, label) => onChange({ refId: id, label })}
    />
  );
}

// ── Tool ──────────────────────────────────────────────────────────────────

function ToolConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  return (
    <div className="space-y-2">
      <FieldLabel>工具名 / 调用</FieldLabel>
      <input
        value={String(meta.config?.toolName ?? meta.refId ?? "")}
        onChange={(e) =>
          onChange({
            refId: e.target.value,
            config: { ...(meta.config ?? {}), toolName: e.target.value },
          })
        }
        placeholder="如 · web_search / fetch_url / send_email"
        className="w-full h-8 px-2 rounded-md ring-1 ring-foreground/15 bg-background text-xs"
      />
      <FieldLabel>参数 (JSON)</FieldLabel>
      <textarea
        value={stringifyConfig(meta.config?.args)}
        onChange={(e) => {
          const parsed = tryParse(e.target.value);
          if (parsed.ok) {
            onChange({ config: { ...(meta.config ?? {}), args: parsed.value } });
          }
        }}
        rows={4}
        placeholder={'{ "query": "..." }'}
        className="w-full px-2 py-1.5 rounded-md ring-1 ring-foreground/15 bg-background text-[11px] font-mono"
      />
    </div>
  );
}

// ── Conditional ───────────────────────────────────────────────────────────

function ConditionalConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  return (
    <div className="space-y-2">
      <FieldLabel>条件表达式 (if true → 第 1 条出边; else → 其余)</FieldLabel>
      <textarea
        value={String(meta.config?.expression ?? meta.refId ?? "")}
        onChange={(e) =>
          onChange({
            refId: e.target.value,
            config: { ...(meta.config ?? {}), expression: e.target.value },
          })
        }
        rows={3}
        placeholder="如 · input.score > 0.8"
        className="w-full px-2 py-1.5 rounded-md ring-1 ring-foreground/15 bg-background text-[11px] font-mono"
      />
      <p className="text-[10px] text-muted-foreground leading-snug">
        条件节点至少需要 2 条出边。出边顺序:真分支在前。
      </p>
    </div>
  );
}

// ── Parallel ──────────────────────────────────────────────────────────────

function ParallelConfig({ meta, onChange }: { meta: DagNodeMeta; onChange: (p: Partial<DagNodeMeta>) => void }) {
  const degree = Number(meta.config?.degree ?? 2);
  return (
    <div className="space-y-2">
      <FieldLabel>并行度 (出边数 = 并行度)</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={2}
          max={6}
          step={1}
          value={degree}
          onChange={(e) =>
            onChange({ config: { ...(meta.config ?? {}), degree: Number(e.target.value) } })
          }
          className="flex-1"
        />
        <span className="text-sm font-mono w-6 text-right">{degree}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        并行节点会同时启动 N 个下游分支,fan-in 等待全部完成。
      </p>
    </div>
  );
}

// ── IO contract card ───────────────────────────────────────────────────────

/**
 * R17-4: visible per-kind IO contract.
 * Answers the operator's "每个管道断点前后输入输出是什么?" question without
 * making them dig through source.
 */
function IOContractCard({ kind }: { kind: NodeKind }) {
  const c = NODE_KIND_CONTRACTS[kind];
  return (
    <div className="rounded-md ring-1 ring-foreground/10 bg-muted/20 px-2.5 py-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          输入 / 输出 契约
        </span>
        {c.blocking && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            阻塞 · 等真人
          </span>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[10px] leading-snug">
        <span className="text-muted-foreground">输入</span>
        <span className="font-mono text-foreground/80">{c.input}</span>
        <span className="text-muted-foreground">输出</span>
        <span className="font-mono text-foreground/80">{c.output}</span>
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug pt-0.5 border-t border-foreground/5">
        {c.behaviour}
      </p>
    </div>
  );
}

// ── Human approval card ────────────────────────────────────────────────────

const APPROVAL_STATE_META: Record<
  ApprovalState,
  { label: string; tone: string; ring: string }
> = {
  idle: { label: "未触发", tone: "bg-slate-100 text-slate-700", ring: "ring-slate-200" },
  waiting: { label: "⏸ 等待真人决策", tone: "bg-amber-100 text-amber-800", ring: "ring-amber-300" },
  approved: { label: "✓ 已批准", tone: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-200" },
  rejected: { label: "✗ 已拒绝", tone: "bg-rose-100 text-rose-700", ring: "ring-rose-200" },
  modified: { label: "✎ 已修改", tone: "bg-sky-100 text-sky-700", ring: "ring-sky-200" },
};

/**
 * R17-4: Human node decision UI.
 * Front-end only scaffolding for human-in-the-loop.
 * Backend wiring (engine pause + POST /approve endpoint) is documented in
 * .claude/handoff-2026-07-09-r17-4-tasks-canvas-done.md.
 *
 * For now, picking a decision updates local meta so the canvas reflects it;
 * the actual pause/approve network call is stubbed via onDecideLocal.
 */
function HumanApprovalCard({
  meta,
  onChange,
}: {
  meta: DagNodeMeta;
  onChange: (p: Partial<DagNodeMeta>) => void;
}) {
  const state: ApprovalState = meta.approvalState ?? "idle";
  const m = APPROVAL_STATE_META[state];
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const decide = (next: ApprovalState) => {
    setBusy(true);
    // Frontend-only stub: real implementation will POST to
    // /api/v2/admin/pipelines/:pid/runs/:runId/nodes/:nodeId/decide
    setTimeout(() => {
      onChange({
        approvalState: next,
        approvalActor: "local:admin",
        approvalNote: note.trim() || undefined,
      });
      setBusy(false);
    }, 250);
  };

  return (
    <div className="rounded-md ring-1 ring-foreground/10 bg-card px-2.5 py-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          真人决策
        </span>
        <span className={cn("text-[10px] px-1.5 py-0.5 rounded ring-1", m.tone, m.ring)}>
          {m.label}
        </span>
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="决策备注 (可选) — 拒绝/修改原因,批准的批注"
        rows={2}
        className="w-full px-2 py-1 rounded-md ring-1 ring-foreground/15 bg-background text-[11px]"
      />
      <div className="grid grid-cols-3 gap-1">
        <button
          type="button"
          disabled={busy || state === "waiting" ? false : true}
          onClick={() => decide("approved")}
          className="h-7 text-[11px] rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          批准
        </button>
        <button
          type="button"
          disabled={busy || state === "waiting" ? false : true}
          onClick={() => decide("rejected")}
          className="h-7 text-[11px] rounded-md bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={busy || state === "waiting" ? false : true}
          onClick={() => decide("modified")}
          className="h-7 text-[11px] rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          修改
        </button>
      </div>
      <p className="text-[9px] text-muted-foreground leading-snug">
        注:后端 pipeline 引擎对 human 节点的暂停 / WS 推送对接见 handoff。
        此面板先在画布层验证 UX。
      </p>
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

const ICON_MAP: Record<NodeKind, LucideIcon> = {
  bot: Bot,
  human: UserRound,
  skill: Wrench,
  tool: Hammer,
  conditional: GitFork,
  parallel: Split,
};

const FALLBACK_SKILLS: Option[] = [
  { id: "skill:web-search", label: "Web 搜索", sub: "联网搜索 + 摘要" },
  { id: "skill:fetch-url", label: "URL 抓取", sub: "提取页面正文" },
  { id: "skill:summarize", label: "摘要", sub: "长文 → 要点" },
  { id: "skill:translate", label: "翻译", sub: "中 ↔ 英 ↔ 日" },
  { id: "skill:industry-tag", label: "行业归类", sub: "采购线索分类" },
  { id: "skill:compose-email", label: "邮件撰写", sub: "B2B 询盘回复" },
];

function Picker({
  title,
  options,
  selectedId,
  onSelect,
  loading,
  error,
}: {
  title: string;
  options: Option[];
  selectedId?: string;
  onSelect: (id: string, label: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{title}</FieldLabel>
      {loading ? (
        <div className="text-[11px] text-muted-foreground">加载中…</div>
      ) : error ? (
        <div className="text-[11px] text-rose-600">{error}</div>
      ) : options.length === 0 ? (
        <div className="text-[11px] text-muted-foreground">无可用选项</div>
      ) : (
        <div className="space-y-1 max-h-[280px] overflow-y-auto -mx-1 px-1">
          {options.map((o) => {
            const active = o.id === selectedId;
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onSelect(o.id, o.label)}
                className={cn(
                  "w-full text-left px-2 py-1.5 rounded-md ring-1 transition-colors",
                  active
                    ? "bg-primary/10 ring-primary/40"
                    : "ring-transparent hover:bg-muted hover:ring-foreground/10",
                )}
              >
                <div className="text-xs font-medium truncate">{o.label}</div>
                {o.sub && (
                  <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
      {children}
    </div>
  );
}

function stringifyConfig(v: unknown): string {
  if (v == null) return "";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  if (!s.trim()) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}
