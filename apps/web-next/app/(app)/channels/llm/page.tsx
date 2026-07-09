"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusPill, toneForLLMStatus } from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import { ModelRoutingPanel } from "@/components/channels/model-routing-panel";
import {
  Cpu,
  Gauge,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Database,
  Zap,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { apiPost, apiPatch, apiDelete, mutate } from "@/lib/channels/api-mutations";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface BackendProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  model: string;
  contextWindow?: number | null;
  isDefault: boolean;
  hasApiKey?: boolean;
  apiKeyMasked?: string | null;
  apiKeyEncrypted?: string | null; // legacy field, not used by listSafe
  createdAt?: string;
  updatedAt?: string;
}

interface ProviderRow {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  model: string;
  contextWindow: number | null;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  latencyMs: number | null;
  lastError: string | null;
  lastTestedAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const TYPE_LABEL: Record<string, string> = {
  openai: "OpenAI 兼容",
  anthropic: "Anthropic",
  google: "Google",
  local: "本地",
  deepseek: "DeepSeek",
  llm: "大语言模型",
  embedding: "向量嵌入",
};

const PROVIDER_TONE: Record<string, string> = {
  openai: "text-emerald-700 dark:text-emerald-300",
  anthropic: "text-amber-700 dark:text-amber-300",
  google: "text-sky-700 dark:text-sky-300",
  local: "text-violet-700 dark:text-violet-300",
  deepseek: "text-rose-700 dark:text-rose-300",
  embedding: "text-stone-700 dark:text-stone-300",
  llm: "text-foreground/80",
};

function labelType(t: string): string {
  return TYPE_LABEL[t?.toLowerCase()] ?? t;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "刚刚";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分钟前`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小时前`;
  return `${Math.floor(ms / 86_400_000)} 天前`;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function LLMProvidersPage() {
  const { data, loading, error, refresh } = useFetch<{ providers: BackendProvider[] }>(
    "/api/providers",
  );
  const [testing, setTesting] = React.useState<Set<string>>(new Set());
  const [latency, setLatency] = React.useState<Record<string, { ms: number | null; err: string | null; at: string }>>({});
  const [editing, setEditing] = React.useState<ProviderRow | null>(null);
  const [showCreate, setShowCreate] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Set<string>>(new Set());
  const [toast, setToast] = React.useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const rows: ProviderRow[] = React.useMemo(() => {
    const list = data?.providers ?? [];
    return list.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type ?? "",
      baseUrl: r.baseUrl ?? "",
      model: r.model ?? "",
      contextWindow: r.contextWindow ?? null,
      isDefault: !!r.isDefault,
      hasApiKey: !!(r.hasApiKey ?? r.apiKeyEncrypted),
      apiKeyMasked: r.apiKeyMasked ?? null,
      latencyMs: latency[r.id]?.ms ?? null,
      lastError: latency[r.id]?.err ?? null,
      lastTestedAt: latency[r.id]?.at ?? r.updatedAt ?? null,
    }));
  }, [data, latency]);

  if (loading) return <LoadingShell />;
  if (error?.code === "not_implemented") return <NotImplShell kind="大模型" />;
  if (error) return <ErrorShell msg={error.message} />;

  const connectedCount = rows.filter((r) => r.hasApiKey).length;
  const needsKeyCount = rows.filter((r) => !r.hasApiKey).length;

  function flashToast(kind: "ok" | "err", msg: string) {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3500);
  }

  async function testOne(row: ProviderRow) {
    setTesting((s) => new Set(s).add(row.id));
    const startTs = Date.now();
    const result = await apiPost<{ ok: boolean; latencyMs?: number; error?: string }>(
      `/api/providers/${encodeURIComponent(row.id)}/test`,
      {},
    );
    setTesting((s) => {
      const next = new Set(s);
      next.delete(row.id);
      return next;
    });
    // If backend did not measure latency (error path), use client-side elapsed.
    const ms = result.data?.latencyMs ?? (result.ok ? Date.now() - startTs : null);
    const err = result.ok ? (result.data?.ok === false ? result.data?.error ?? "握手失败" : null) : result.error;
    setLatency((prev) => ({
      ...prev,
      [row.id]: { ms, err, at: new Date().toISOString() },
    }));
    if (err) flashToast("err", `${row.name}: ${err}`);
  }

  async function testAll() {
    for (const row of rows) {
      void testOne(row);
      await new Promise((r) => setTimeout(r, 120)); // slight stagger
    }
  }

  async function deleteOne(row: ProviderRow) {
    if (!window.confirm(`确认删除服务商「${row.name}」?此操作不可撤销。`)) return;
    setDeleting((s) => new Set(s).add(row.id));
    const result = await mutate("DELETE", `/api/providers/${encodeURIComponent(row.id)}`, { refresh });
    setDeleting((s) => {
      const next = new Set(s);
      next.delete(row.id);
      return next;
    });
    if (result.ok) flashToast("ok", `已删除「${row.name}」`);
    else flashToast("err", result.error ?? "删除失败");
  }

  async function setDefault(id: string) {
    const result = await apiPatch(`/api/providers/${encodeURIComponent(id)}`, { isDefault: true });
    if (result.ok) flashToast("ok", "已设为默认模型");
    else flashToast("err", result.error ?? "设置默认失败");
    refresh();
  }

  function onSaved(name: string, isNew: boolean) {
    setEditing(null);
    setShowCreate(false);
    flashToast("ok", isNew ? `已新增「${name}」` : `已更新「${name}」`);
    refresh();
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "服务商", value: rows.length },
            { label: "已连接", value: connectedCount },
            { label: "待配置密钥", value: needsKeyCount },
          ]}
          footnote={
            <>
              API Key 在服务端 AES 加密存储(<code className="font-mono">provider_configs.api_key_encrypted</code>
              ),界面永不回显明文。点击「测速」对当前接口地址 + 模型做一次握手探测(10 秒超时)。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">大模型</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {rows.length} 个
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={testAll}
              disabled={rows.length === 0}
            >
              <RotateCcw className="size-3.5" />
              全部测速
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5" />
              新增服务商
            </Button>
          </div>
        </>
      }
    >
      <ModelRoutingPanel providers={rows} onSetDefault={setDefault} />
      <DenseTable
        head={["服务商", "类型", "模型", "接口地址", "状态", "延迟", "上次测试", "操作"]}
        rows={rows.map((p) => ({
          cells: [
            <div key="n" className="flex items-center gap-2">
              <div className="size-6 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                <Cpu className="size-3.5 text-muted-foreground" />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {p.id.slice(0, 8)}
                </div>
              </div>
              {p.isDefault && (
                <span className="ml-1 text-[9px] font-mono uppercase tracking-wide bg-foreground text-background px-1 py-0.5 rounded-sm">
                  默认
                </span>
              )}
            </div>,
            <span
              key="t"
              className={cn(
                "text-[11px] font-mono tracking-wide",
                PROVIDER_TONE[p.type?.toLowerCase()] ?? "text-muted-foreground",
              )}
            >
              {labelType(p.type)}
            </span>,
            <MonoCell key="m">{p.model || "—"}</MonoCell>,
            <MonoCell
              key="u"
              className="text-muted-foreground max-w-[16rem] truncate inline-block"
              title={p.baseUrl}
            >
              {p.baseUrl || "—"}
            </MonoCell>,
            p.hasApiKey ? (
              <StatusPill key="s" tone={toneForLLMStatus("connected")} label="已连接" />
            ) : (
              <StatusPill key="s" tone={toneForLLMStatus("needs-api-key")} label="未配置密钥" />
            ),
            <MonoCell
              key="l"
              className={cn(
                p.lastError
                  ? "text-rose-600 dark:text-rose-400"
                  : p.latencyMs !== null
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground",
              )}
            >
              {testing.has(p.id) ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" /> 测试中
                </span>
              ) : p.lastError ? (
                <span title={p.lastError}>失败</span>
              ) : p.latencyMs !== null ? (
                `${p.latencyMs} ms`
              ) : (
                "—"
              )}
            </MonoCell>,
            <MonoCell key="lt" className="text-muted-foreground">
              {timeAgo(p.lastTestedAt)}
            </MonoCell>,
            <div key="a" className="flex items-center gap-1 justify-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => testOne(p)}
                aria-label="测速"
                disabled={testing.has(p.id) || !p.hasApiKey}
                title="测速"
              >
                <Zap
                  className={cn(
                    "size-3.5",
                    testing.has(p.id) && "animate-pulse text-amber-500",
                  )}
                />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setEditing(p)}
                aria-label="编辑"
                title="编辑"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="删除"
                title="删除"
                className="hover:text-rose-600"
                disabled={deleting.has(p.id)}
                onClick={() => deleteOne(p)}
              >
                {deleting.has(p.id) ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            </div>,
          ],
        }))}
        empty="尚未配置任何服务商,点击「新增服务商」开始。"
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>密钥</KeyCell>
        {rows.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                p.hasApiKey ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {p.name}
          </span>
        ))}
      </div>

      {toast && (
        <div
          className={cn(
            "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
            toast.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
          )}
        >
          {toast.kind === "ok" ? (
            <KeyRound className="size-4" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          {toast.msg}
        </div>
      )}

      {showCreate && (
        <ProviderFormDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={(name) => onSaved(name, true)}
        />
      )}

      {editing && (
        <ProviderFormDialog
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => onSaved(name, false)}
        />
      )}
    </ChannelsPageShell>
  );
}

/* ------------------------------------------------------------------ */
/* Create / Edit dialog                                                */
/* ------------------------------------------------------------------ */

interface FormProps {
  mode: "create" | "edit";
  initial?: ProviderRow;
  onClose: () => void;
  onSaved: (name: string) => void;
}

function ProviderFormDialog({ mode, initial, onClose, onSaved }: FormProps) {
  const isEdit = mode === "edit";
  const [name, setName] = React.useState(initial?.name ?? "");
  const [type, setType] = React.useState(initial?.type ?? "openai");
  const [baseUrl, setBaseUrl] = React.useState(initial?.baseUrl ?? "");
  const [model, setModel] = React.useState(initial?.model ?? "");
  const [apiKey, setApiKey] = React.useState("");
  const [contextWindow, setContextWindow] = React.useState<string>(
    initial?.contextWindow ? String(initial.contextWindow) : "",
  );
  const [isDefault, setIsDefault] = React.useState(!!initial?.isDefault);
  const [busy, setBusy] = React.useState(false);
  const [testingConn, setTestingConn] = React.useState(false);
  const [testResult, setTestResult] = React.useState<{ ok: boolean; msg: string } | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const canSave = name.trim() && model.trim() && (isEdit ? true : apiKey.trim().length > 0);

  async function runTestConnection() {
    setTestResult(null);
    setErr(null);
    if (!baseUrl.trim() || (!isEdit && !apiKey.trim())) {
      setErr("接口地址和 API Key 是测试连接的必填项");
      return;
    }
    setTestingConn(true);
    const result = await apiPost<{ ok: boolean; error?: string; model?: string }>(
      "/api/providers/test",
      {
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        model: model.trim(),
        type,
        ...(isEdit && initial ? { providerId: initial.id } : {}),
      },
    );
    setTestingConn(false);
    if (!result.ok) {
      setTestResult({ ok: false, msg: result.error ?? "请求失败" });
    } else if (result.data?.ok === false) {
      setTestResult({ ok: false, msg: result.data.error ?? "握手失败" });
    } else {
      setTestResult({ ok: true, msg: `连接成功${result.data?.model ? " · " + result.data.model : ""}` });
    }
  }

  async function save() {
    setErr(null);
    if (!canSave) {
      setErr("名称、模型为必填项;新增时 API Key 也必填");
      return;
    }
    setBusy(true);

    const body: Record<string, any> = {
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      contextWindow: contextWindow.trim() ? Number(contextWindow) : null,
      isDefault,
    };
    if (apiKey.trim()) body.apiKey = apiKey.trim();

    if (isEdit && initial) {
      const result = await apiPatch(`/api/providers/${encodeURIComponent(initial.id)}`, body);
      setBusy(false);
      if (!result.ok) {
        setErr(result.error ?? "保存失败");
        return;
      }
      onSaved(name.trim());
    } else {
      const result = await apiPost("/api/providers", body);
      setBusy(false);
      if (!result.ok) {
        setErr(result.error ?? "新增失败");
        return;
      }
      onSaved(name.trim());
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            {isEdit ? `编辑服务商 · ${initial?.name}` : "新增服务商"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? "API Key 留空则保留原值;填入新值将覆盖。所有密钥均加密存储,不回显明文。"
              : "配置一个新的 LLM 或 Embedding 服务商。带 * 为必填项。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <Field label="名称 *" htmlFor="pf-name">
              <Input
                id="pf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如:DeepSeek / 智谱"
                disabled={isEdit}
              />
            </Field>
            <Field label="类型" htmlFor="pf-type">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="pf-type" className="h-9">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI 兼容</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="llm">大语言模型(LLM)</SelectItem>
                  <SelectItem value="embedding">向量嵌入</SelectItem>
                  <SelectItem value="local">本地</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="接口地址(Base URL)" htmlFor="pf-base">
            <Input
              id="pf-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.deepseek.com/v1"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="模型名 *" htmlFor="pf-model">
              <Input
                id="pf-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="deepseek-chat"
              />
            </Field>
            <Field label="上下文窗口(tokens)" htmlFor="pf-ctx">
              <Input
                id="pf-ctx"
                type="number"
                inputMode="numeric"
                value={contextWindow}
                onChange={(e) => setContextWindow(e.target.value)}
                placeholder="例如:64000"
              />
            </Field>
          </div>

          <Field label="API Key(接口密钥)" htmlFor="pf-key">
            <Input
              id="pf-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                isEdit
                  ? initial?.apiKeyMasked
                    ? `当前 ${initial.apiKeyMasked} · 留空保留`
                    : "sk-..."
                  : "sk-..."
              }
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[10.5px] text-muted-foreground font-mono">
              type=password · 输入值不回显,只在提交或测试连接时使用一次
            </p>
          </Field>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-3.5"
            />
            <span>设为默认服务商(已存在的默认会被取消)</span>
          </label>

          {testResult && (
            <div
              className={cn(
                "rounded-md border px-3 py-2 text-[11px]",
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300",
              )}
            >
              {testResult.ok ? "✓ " : "✗ "}
              {testResult.msg}
            </div>
          )}

          {err && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={runTestConnection}
            disabled={testingConn || busy}
            className="mr-auto gap-1.5"
          >
            {testingConn ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Gauge className="size-3.5" />
            )}
            测试连接
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={!canSave || busy} className="gap-1.5">
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            {isEdit ? "保存" : "新增"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[11px] text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */

function LoadingShell() {
  return (
    <ChannelsPageShell
      meta={<PageMeta items={[{ label: "加载中", value: "…" }]} footnote="正在拉取服务商列表…" />}
      toolbar={<div className="h-6 w-32 rounded bg-muted/40 animate-pulse" />}
    >
      <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
    </ChannelsPageShell>
  );
}

function NotImplShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "后端", value: "未实装" }]}
          footnote={`后端未实装 ${kind} 端点。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Database className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          空状态
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。
          <br />
          后端上线后刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}

function ErrorShell({ msg }: { msg: string }) {
  return (
    <ChannelsPageShell
      meta={<PageMeta items={[{ label: "错误", value: msg.slice(0, 24) }]} footnote={msg} />}
      toolbar={<></>}
    >
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
        加载失败 · {msg}
      </div>
    </ChannelsPageShell>
  );
}
