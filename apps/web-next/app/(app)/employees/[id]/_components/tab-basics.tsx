"use client";

import * as React from "react";
import { useAgent, updateAgent, type Agent } from "../../_lib/data";
import { Calendar, Tag, Cpu, GitBranch, User2, Sparkles, Check, Loader2, AlertCircle, Gauge, Archive } from "lucide-react";
import {
  EditPane,
  EditableText,
  EditableTextarea,
  EditableSelect,
  agentToDraft,
  diffDraft,
} from "./edit-mode";
// 注:EditableSelect 仍用于复杂度/状态(⑨⑩),引擎/模型下拉已删除(⑧)
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast/toast-provider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { normalizeAutoCompressDraft } from "../../new/_components/form";
import { CONTEXT_PRESETS, buildModelBindingPatch, engineFromProvider, nextSelectedProviderIdOnBindingRefresh, readUseModelRouting } from "./tab-basics-config";

// ⑨ 复杂度四档(中文,智能体运行参数,不受底层模型影响)
const COMPLEXITY_OPTIONS = [
  { value: "L1", label: "极速简答" },
  { value: "L2", label: "均衡对话" },
  { value: "L3", label: "深度推演" },
  { value: "L4", label: "自主专家" },
];

// ⑩ 状态三项(中文)
const STATUS_OPTIONS = [
  { value: "active", label: "启用" },
  { value: "paused", label: "暂停" },
  { value: "deprecated", label: "弃用" },
];

// ⑤ 角色 HR 岗位仅在创建时选择,编辑页不可改;⑧ 引擎/模型由专属大模型卡片管理
// 故 FIELDS 只保留可编辑字段:name / description / category / complexity_level / status
const FIELDS = [
  "name", "description", "category",
  "complexity_level", "status",
];

// ── 大模型绑定区数据类型(对齐 /api/providers) ─────────────────
interface ProviderInfo {
  id: string;
  name: string;
  model: string;
  type: string;
  baseUrl?: string;
  contextWindow?: number | null;
  isDefault?: boolean;
  hasApiKey?: boolean;
  apiKeyMasked?: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  openai: "OpenAI 兼容",
  anthropic: "Anthropic",
  google: "Google",
  local: "本地",
  deepseek: "DeepSeek",
  embedding: "向量嵌入",
  llm: "大语言模型",
  glm: "智谱 GLM",
  zhipu: "智谱 GLM",
  minimax: "MiniMax",
};

/** 安全解析 JSON 字符串,失败返回空对象(用于 orchestration 等字段)。 */
function safeParse(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// R28-A: Agent 基础信息卡片统一真人 BasicTab 卡片布局
// - 基本信息 卡片(名称/描述/角色/分类)
// - 系统信息 卡片(Agent ID/工作目录/引擎·模型/主理人/HR 来源/版本/创建于)
// - 专属大模型 绑定卡片(R31-C 新增,独立保存)
// - 编辑模式: 第二卡片切换为"引擎与模型"编辑表单
export function TabBasics({ id }: { id: string }) {
  const { agent, loading, reload, setAgent } = useAgent(id);
  const [draft, setDraft] = React.useState<Record<string, unknown>>({});
  const [origDraft, setOrigDraft] = React.useState<Record<string, unknown>>({});

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

  const categoryValue =
    (agent.raw as Record<string, unknown> | null)?.category ?? "general";

  return (
    <EditPane id={id} label="basics" onSaved={reload} isDirty={isDirty} onSave={onSave}>
      {(ctx) => (
        <div className="space-y-4">
          {/* === 基本信息 卡片 === */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">基本信息</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <EditableText
                label="名称"
                field="name"
                value={agent.displayName}
                editing={ctx.editing}
                draft={draft}
                setDraft={setDraft}
                placeholder="给员工取个名字"
                hint="显示名跟随名称"
              />
              {/* ⑤ 角色 HR:创建时选定,实例独立,编辑页只读不可改 */}
              <ReadonlyField label="角色类型" icon={Cpu}>
                <code className="font-mono text-[13px] tracking-tight">{agent.role}</code>
              </ReadonlyField>
              {ctx.editing ? (
                <EditableText
                  label="分类"
                  field="category"
                  value={String(categoryValue)}
                  editing
                  draft={draft}
                  setDraft={setDraft}
                  mono
                />
              ) : (
                <ReadonlyField label="分类" icon={Tag}>
                  <code className="font-mono text-[13px]">{String(categoryValue)}</code>
                </ReadonlyField>
              )}
              <div className="md:col-span-2">
                <EditableTextarea
                  label="描述"
                  field="description"
                  value={agent.description || ""}
                  editing={ctx.editing}
                  draft={draft}
                  setDraft={setDraft}
                  placeholder="一句话描述这位员工"
                  rows={2}
                />
              </div>
            </div>
          </div>

          {/* === 运行参数 / 系统信息 卡片 === */}
          <div className="rounded-xl border border-border bg-card p-5">
            {ctx.editing ? (
              <>
                <h3 className="text-sm font-semibold mb-4">运行参数</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <EditableSelect
                    label="复杂度"
                    field="complexity_level"
                    value={agent.complexityLevel}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={COMPLEXITY_OPTIONS}
                  />
                  <EditableSelect
                    label="状态"
                    field="status"
                    value={agent.status}
                    editing
                    draft={draft}
                    setDraft={setDraft}
                    options={STATUS_OPTIONS}
                  />
                </div>
                {/* ⑧ 引擎/模型已由专属大模型卡片管理,编辑页不再提供下拉 */}
                <p className="mt-3 text-[11.5px] text-muted-foreground">
                  引擎与大模型请在下方「专属大模型」卡片中绑定。
                </p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-semibold mb-4">系统信息</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <ReadonlyField label="编号" icon={Cpu}>
                    <code className="font-mono text-[12.5px]">{agent.id}</code>
                  </ReadonlyField>
                  <ReadonlyField label="工作目录" icon={GitBranch}>
                    <code className="font-mono text-[12.5px] break-all">
                      {agent.workingDir || "—"}
                    </code>
                  </ReadonlyField>
                  <ReadonlyField label="专属模型" icon={Cpu}>
                    <span className="font-mono text-[12.5px]">
                      {agent.defaultModel || "默认"}
                    </span>
                  </ReadonlyField>
                  <ReadonlyField label="复杂度" icon={Tag}>
                    <span>
                      {COMPLEXITY_OPTIONS.find((o) => o.value === agent.complexityLevel)?.label ?? agent.complexityLevel}
                    </span>
                  </ReadonlyField>
                  <ReadonlyField label="主理人" icon={User2}>
                    <span className="font-medium">{agent.ownerName}</span>
                  </ReadonlyField>
                  <ReadonlyField label="来源" icon={GitBranch}>
                    {agent.templateSource ? (
                      <span className="font-mono text-[12.5px]">
                        {String(agent.templateSource).slice(0, 8)}…
                      </span>
                    ) : (
                      <span className="text-foreground/50">原创</span>
                    )}
                  </ReadonlyField>
                  <ReadonlyField label="版本" icon={Tag}>
                    <span className="font-mono">v{agent.version}</span>
                  </ReadonlyField>
                  <ReadonlyField label="创建于" icon={Calendar}>
                    <span className="font-mono text-[12.5px]">
                      {new Date(agent.createdAt).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </ReadonlyField>
                </div>
              </>
            )}
          </div>

          {/* === 专属大模型 绑定卡片 (R31-C) === */}
          <ModelBindingCard agent={agent} onSaved={reload} setAgent={setAgent} />

          {/* === R34-B: 上下文窗口 + 自动压缩 === */}
          <ContextWindowCard agent={agent} onSaved={reload} setAgent={setAgent} />
        </div>
      )}
    </EditPane>
  );
}

// ────────────────────────────────────────────────────────────
// R34-B: 上下文窗口 + 自动压缩配置卡片
// - 读 agent.defaultContextWindow + agent.raw.orchestration.autoCompress
// - 窗口:预设档位(32/64/128/200K)+ 自定义数值;提示当前模型最大值
// - 压缩:启用/阈值/比例,存 orchestration.autoCompress jsonb
// - 保存:PATCH /api/v2/employees/:id { default_context_window, orchestration }
// ────────────────────────────────────────────────────────────

interface AutoCompressConfig {
  enabled: boolean;
  warnThresholdPct: number;
  thresholdPct: number;
  resetThresholdPct: number;
  ratioPct: number;
}

/** 从 agent.raw.orchestration 解析出 autoCompress 配置(兜底默认值)。 */
function readAutoCompress(agent: Agent): AutoCompressConfig {
  const raw = agent.raw as Record<string, unknown> | null;
  const orchRaw = raw?.orchestration;
  const orch =
    typeof orchRaw === "string" ? safeParse(orchRaw) : (orchRaw as Record<string, unknown> | null);
  const ac = (orch?.autoCompress ?? {}) as Record<string, unknown>;
  return normalizeAutoCompressDraft({
    enabled: typeof ac.enabled === "boolean" ? (ac.enabled as boolean) : true,
    warnThresholdPct: typeof ac.warnThresholdPct === "number" ? (ac.warnThresholdPct as number) : 50,
    thresholdPct: typeof ac.thresholdPct === "number" ? (ac.thresholdPct as number) : 70,
    resetThresholdPct: typeof ac.resetThresholdPct === "number" ? (ac.resetThresholdPct as number) : 85,
    ratioPct: typeof ac.ratioPct === "number" ? (ac.ratioPct as number) : 50,
  });
}

function ContextWindowCard({ agent, onSaved, setAgent }: { agent: Agent; onSaved: () => void; setAgent: (next: Agent | null) => void }) {
  const toast = useToast();
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [ctxDraft, setCtxDraft] = React.useState<number>(agent.defaultContextWindow || 200000);
  const [ac, setAc] = React.useState<AutoCompressConfig>(() => readAutoCompress(agent));
  const [saving, setSaving] = React.useState(false);

  // 拉 providers 用来提示当前模型最大值
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api<{ providers: ProviderInfo[] } | ProviderInfo[]>("/api/providers");
        if (!alive) return;
        const list =
          (res as { providers?: ProviderInfo[] })?.providers ??
          (Array.isArray(res) ? (res as ProviderInfo[]) : []);
        setProviders(list.filter((p) => (p.type || "").toLowerCase() !== "embedding"));
      } catch {
        setProviders([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 外部 agent 变化(保存后刷新)→ 同步本地草稿
  React.useEffect(() => {
    setCtxDraft(agent.defaultContextWindow || 200000);
    setAc(readAutoCompress(agent));
  }, [agent?.id, agent?.updatedAt, agent.defaultContextWindow]);

  // 当前绑定模型的最大上下文
  const curModel = (agent.defaultModel || "").toLowerCase();
  const curEngine = (agent.defaultEngine || "").toLowerCase();
  const currentProvider =
    providers.find((p) => (p.model || "").toLowerCase() === curModel) ??
    providers.find((p) => engineFromProvider(p) === curEngine) ??
    null;
  const providerMax =
    currentProvider && typeof currentProvider.contextWindow === "number" && currentProvider.contextWindow > 0
      ? currentProvider.contextWindow
      : null;

  const origAc = readAutoCompress(agent);
  const origCtx = agent.defaultContextWindow || 200000;
  const dirtyCtx = ctxDraft !== origCtx;
  const dirtyAc =
    ac.enabled !== origAc.enabled ||
    ac.warnThresholdPct !== origAc.warnThresholdPct ||
    ac.thresholdPct !== origAc.thresholdPct ||
    ac.resetThresholdPct !== origAc.resetThresholdPct ||
    ac.ratioPct !== origAc.ratioPct;
  const isDirty = dirtyCtx || dirtyAc;
  const exceedsMax = providerMax !== null && ctxDraft > providerMax;

  const presetValues: number[] = CONTEXT_PRESETS.map((p) => p.value);
  const isCustom = !presetValues.includes(ctxDraft);

  async function save() {
    setSaving(true);
    try {
      // 合并 orchestration(保留既有键,写入 autoCompress)
      const raw = agent.raw as Record<string, unknown> | null;
      const orchRaw = raw?.orchestration;
      const baseOrch =
        (typeof orchRaw === "string" ? safeParse(orchRaw) : (orchRaw as Record<string, unknown> | null)) ?? {};
      const normalizedAc = normalizeAutoCompressDraft(ac);
      setAc(normalizedAc);
      const patch: Record<string, unknown> = {
        orchestration: { ...baseOrch, autoCompress: normalizedAc },
      };
      if (dirtyCtx) patch.default_context_window = ctxDraft;
      const updated = await updateAgent(agent.id, patch);
      if (updated) setAgent(updated);
      toast.success("上下文与压缩配置已保存");
      onSaved();
    } catch (e: unknown) {
      toast.error(`保存失败:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Gauge className="size-4 text-sky-500" />
        <h3 className="text-sm font-semibold">上下文窗口与自动压缩</h3>
      </div>
      <p className="mb-4 text-[11.5px] text-muted-foreground">
        窗口决定一次能读入多少对话历史;自动压缩在临近上限时把早期历史摘要成精简版,避免对话被截断。
        {providerMax && (
          <>
            当前模型 <code className="font-mono">{currentProvider?.model}</code> 最大支持{" "}
            <code className="font-mono">{providerMax.toLocaleString()}</code> tokens(自动读取)。
          </>
        )}
      </p>

      {/* 窗口预设 */}
      <div className="mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        上下文窗口
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {CONTEXT_PRESETS.map((p) => {
          const active = !isCustom && ctxDraft === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => setCtxDraft(p.value)}
              className={cn(
                "rounded-lg px-3 py-2 text-left text-[12px] ring-1 transition-colors",
                active
                  ? "ring-sky-500/50 bg-sky-500/[0.07] text-foreground"
                  : "ring-border hover:bg-muted/30 text-foreground/80",
              )}
            >
              <span className="font-medium">{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* 自定义窗口 */}
      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 ring-1 ring-border">
        <span className="text-[11.5px] font-medium text-foreground/75">自定义</span>
        <input
          type="number"
          min={1000}
          step={1000}
          inputMode="numeric"
          value={ctxDraft}
          onChange={(e) => {
            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
            setCtxDraft(n);
          }}
          className="w-40 rounded-md bg-background px-2.5 py-1.5 text-right font-mono text-[12.5px] tabular-nums ring-1 ring-border focus:outline-none focus:ring-foreground/40"
          aria-label="自定义上下文窗口 tokens"
        />
        <span className="text-[11px] text-foreground/55">tokens</span>
        {exceedsMax && (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            ⚠ 超过模型最大值 {providerMax!.toLocaleString()},实际会被截断
          </span>
        )}
      </div>

      {/* 自动压缩 */}
      <div className="mt-4 mb-2 flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        <Archive className="size-3" />
        自动压缩
      </div>
      <label className="flex items-start gap-2.5 rounded-lg bg-muted/30 px-3 py-2.5 ring-1 ring-border cursor-pointer hover:bg-muted/50 transition-colors">
        <input
          type="checkbox"
          checked={ac.enabled}
          onChange={(e) => setAc({ ...ac, enabled: e.target.checked })}
          className="mt-0.5 size-3.5 accent-sky-500"
        />
        <div className="flex-1">
          <div className="text-[12.5px] font-medium text-foreground/90">启用自动压缩</div>
          <div className="text-[11px] leading-snug text-muted-foreground mt-0.5">
            对话累积到阈值时,系统自动把早期历史压缩成摘要,腾出空间继续对话。
          </div>
        </div>
      </label>
      {ac.enabled && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <CompactNumberField
            label="警告阈值"
            suffix="%"
            min={10}
            max={95}
            value={ac.warnThresholdPct}
            onChange={(n) => setAc(normalizeAutoCompressDraft({ ...ac, warnThresholdPct: n }))}
            hint={`用到 ${ac.warnThresholdPct}% 时提示`}
          />
          <CompactNumberField
            label="压缩触发阈值"
            suffix="%"
            min={10}
            max={99}
            value={ac.thresholdPct}
            onChange={(n) => setAc(normalizeAutoCompressDraft({ ...ac, thresholdPct: n }))}
            hint={`用到 ${ac.thresholdPct}% 时压缩`}
          />
          <CompactNumberField
            label="强制重置阈值"
            suffix="%"
            min={10}
            max={99}
            value={ac.resetThresholdPct}
            onChange={(n) => setAc(normalizeAutoCompressDraft({ ...ac, resetThresholdPct: n }))}
            hint={`用到 ${ac.resetThresholdPct}% 时开新会话`}
          />
          <CompactNumberField
            label="压缩后保留比例"
            suffix="%"
            min={10}
            max={90}
            value={ac.ratioPct}
            onChange={(n) => setAc(normalizeAutoCompressDraft({ ...ac, ratioPct: n }))}
            hint={`保留约 ${ac.ratioPct}%`}
          />
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button size="sm" onClick={save} disabled={!isDirty || saving || exceedsMax} className="gap-1.5">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {saving ? "保存中…" : "保存配置"}
        </Button>
      </div>
    </div>
  );
}

function CompactNumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg bg-background/40 px-3 py-2 ring-1 ring-border">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-medium text-foreground/80">{label}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Math.min(max, Math.max(min, Math.floor(Number(e.target.value) || 0)));
              onChange(n);
            }}
            className="w-16 rounded-md bg-background px-2 py-1 text-right font-mono text-[12px] tabular-nums ring-1 ring-border focus:outline-none focus:ring-foreground/40"
          />
          {suffix && <span className="text-[11px] text-foreground/55">{suffix}</span>}
        </div>
      </div>
      {hint && <p className="text-[10.5px] leading-snug text-foreground/55">{hint}</p>}
    </div>
  );
}

// ── 专属大模型 绑定卡片(R31-C 新增) ────────────────────────────
// - 从 /api/providers 拉真实 LLM provider 列表(过滤 embedding)
// - 单选 + 独立保存(不走 EditPane),PATCH /api/v2/employees/:id
//   { default_engine, default_model }
// - 用 Toast 通知,不用 alert
function ModelBindingCard({ agent, onSaved, setAgent }: { agent: Agent; onSaved: () => void; setAgent: (next: Agent | null) => void }) {
  const toast = useToast();
  const [providers, setProviders] = React.useState<ProviderInfo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // 拉取 providers 列表
  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api<{ providers: ProviderInfo[] } | ProviderInfo[]>("/api/providers");
        if (!alive) return;
        const list =
          (res as { providers?: ProviderInfo[] })?.providers ??
          (Array.isArray(res) ? (res as ProviderInfo[]) : []);
        // 只显示 LLM(过滤 embedding)
        const llm = list.filter((p) => (p.type || "").toLowerCase() !== "embedding");
        setProviders(llm);
        setErr(null);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 当前绑定的 provider(先按 model 精确匹配,再按 engine 模糊匹配)
  const currentBinding = React.useMemo<ProviderInfo | null>(() => {
    const curModel = (agent.defaultModel || "").toLowerCase();
    const curEngine = (agent.defaultEngine || "").toLowerCase();
    return (
      providers.find((p) => (p.model || "").toLowerCase() === curModel) ??
      providers.find((p) => engineFromProvider(p) === curEngine) ??
      null
    );
  }, [providers, agent.defaultModel, agent.defaultEngine]);

  // 初始化选中(默认指向当前绑定);agent 刷新后同步,但不覆盖用户未保存选择。
  const lastSyncedBindingId = React.useRef<string | null>(null);

  React.useEffect(() => {
    lastSyncedBindingId.current = null;
    setSelectedId(null);
  }, [agent.id]);

  React.useEffect(() => {
    const currentBindingId = currentBinding?.id ?? null;
    setSelectedId((prev) =>
      nextSelectedProviderIdOnBindingRefresh({
        selectedId: prev,
        currentBindingId,
        lastSyncedBindingId: lastSyncedBindingId.current,
      }),
    );
    lastSyncedBindingId.current = currentBindingId;
  }, [agent.id, agent.updatedAt, currentBinding?.id]);

  // R32-B/R36-1: 模型路由开关 — 存 agent.orchestration.useModelRouting
  const rawOrch = (agent.raw as Record<string, unknown> | null)?.orchestration;
  const orchObj = (typeof rawOrch === "string" ? safeParse(rawOrch) : rawOrch) as
    | Record<string, unknown>
    | null;
  const savedUseRouting = readUseModelRouting(orchObj);
  const [useRouting, setUseRouting] = React.useState<boolean>(savedUseRouting);

  React.useEffect(() => {
    setUseRouting(savedUseRouting);
  }, [agent.id, agent.updatedAt, savedUseRouting]);

  const selectedProvider = selectedId ? providers.find((x) => x.id === selectedId) ?? null : null;
  const modelDirty = !!selectedProvider && selectedProvider.id !== currentBinding?.id;
  const routingDirty = useRouting !== savedUseRouting;
  const isDirty = modelDirty || routingDirty;

  async function save() {
    if (!selectedProvider && !routingDirty) return;
    setSaving(true);
    try {
      const patch = buildModelBindingPatch({
        selectedProvider,
        currentProvider: currentBinding,
        useModelRouting: useRouting,
        orchestration: orchObj,
      });
      // R38-E: 写 model_id 到 body(snake_case 对齐后端 PATCH handler),让后端联级更新 agents.model_id FK
      if (selectedProvider && selectedProvider.id !== currentBinding?.id) {
        patch.model_id = selectedProvider.id;
      }
      const updated = await updateAgent(agent.id, patch);
      if (updated) setAgent(updated);
      toast.success(
        `已${modelDirty && selectedProvider ? `绑定 ${selectedProvider.name} · ${selectedProvider.model}` : "更新模型路由"}${useRouting ? "(遵循全局路由)" : "(固定模型)"}`,
      );
      onSaved();
    } catch (e: unknown) {
      toast.error(`保存失败:${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-1 flex items-center gap-2">
        <Sparkles className="size-4 text-amber-500" />
        <h3 className="text-sm font-semibold">专属大模型</h3>
      </div>
      <p className="mb-4 text-[11.5px] text-muted-foreground">
        为这位员工绑定专属大模型,覆盖系统默认。数据来自 <code className="font-mono">/api/providers</code>,保存即时生效。
      </p>

      {/* 当前绑定 */}
      <div className="mb-4 rounded-lg ring-1 ring-border bg-background/40 px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
            当前绑定
          </div>
          <div className="text-sm mt-0.5 truncate">
            {currentBinding ? (
              <>
                <span className="font-medium">{currentBinding.name}</span>
                <span className="font-mono text-[12px] text-foreground/65">
                  {" "}&middot; {currentBinding.model}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                <span className="font-mono">{agent.defaultEngine}</span>
                {" "}&middot; {agent.defaultModel || "默认(未绑定专属)"}
              </span>
            )}
          </div>
        </div>
        {currentBinding?.isDefault ? (
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
            系统默认
          </span>
        ) : null}
      </div>

      {/* R32-B: 模型路由开关 */}
      <label className="mb-4 flex items-start gap-2.5 rounded-lg ring-1 ring-border bg-background/40 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors">
        <input
          type="checkbox"
          checked={useRouting}
          onChange={(e) => setUseRouting(e.target.checked)}
          className="mt-0.5 size-3.5 accent-amber-500"
        />
        <div className="flex-1">
          <div className="text-[13px] font-medium text-foreground/90">遵循全局路由(自动调度最优模型)</div>
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            开启时:失败自动 fallback 到备用模型,按全局策略选最优。
            <br />
            关闭时:固定使用下方选定模型,不触发路由切换。
          </div>
        </div>
      </label>

      {/* 加载 / 错误 / 列表 */}
      {loading ? (
        <div className="h-32 rounded-lg bg-muted/30 animate-pulse" />
      ) : err ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
          <span>加载大模型列表失败:{err}</span>
        </div>
      ) : providers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          暂无可用大模型,请先到「渠道 → 大模型」配置服务商。
        </div>
      ) : (
        <ul className="space-y-1.5" role="radiogroup" aria-label="选择专属大模型">
          {providers.map((p) => {
            const checked = selectedId === p.id;
            const typeLabel = TYPE_LABEL[(p.type || "").toLowerCase()] ?? p.type ?? "LLM";
            return (
              <li key={p.id}>
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-lg px-3 py-2.5 ring-1 transition-colors",
                    useRouting ? "cursor-not-allowed opacity-55" : "cursor-pointer",
                    checked
                      ? "ring-amber-500/40 bg-amber-500/[0.06]"
                      : useRouting
                        ? "ring-border"
                        : "ring-border hover:bg-muted/30",
                  )}
                >
                  <input
                    type="radio"
                    name="model-binding"
                    value={p.id}
                    checked={checked}
                    disabled={useRouting}
                    onChange={() => setSelectedId(p.id)}
                    className="mt-1 size-3.5 accent-amber-500 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-medium">{p.name}</span>
                      <span className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        {typeLabel}
                      </span>
                      {p.isDefault ? (
                        <span className="text-[10px] font-mono uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                          默认
                        </span>
                      ) : null}
                      {p.hasApiKey === false ? (
                        <span className="text-[10px] font-mono uppercase tracking-wide bg-rose-500/15 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded">
                          未配置 Key
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[11.5px] font-mono text-foreground/65 truncate">
                      {p.model || "—"}
                      {p.baseUrl ? (
                        <span className="text-foreground/35">{" "}&middot; {p.baseUrl}</span>
                      ) : null}
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {/* 保存按钮 */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          size="sm"
          onClick={save}
          disabled={!isDirty || saving || loading || !!err}
          className="gap-1.5"
          data-testid="save-model-binding"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {saving ? "保存中…" : "保存绑定"}
        </Button>
      </div>
    </div>
  );
}

// ReadonlyField: BasicTab 同款 label 风格(小字大写 + value text-sm)
function ReadonlyField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-mono uppercase tracking-[0.18em] text-foreground/45">
        <Icon className="size-3" />
        <span>{label}</span>
      </div>
      <div className="text-sm text-foreground/85">{children}</div>
    </div>
  );
}
