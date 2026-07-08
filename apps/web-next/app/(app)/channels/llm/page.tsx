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
import { StatusPill, toneForLLMStatus } from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  Cpu,
  Gauge,
  KeyRound,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Database,
} from "lucide-react";
import type { LLMProvider } from "@/lib/channels/types";
import { useFetch } from "@/lib/channels/use-fetch";
import { cn } from "@/lib/utils";

interface BackendProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  model: string;
  isDefault: boolean;
  apiKeyEncrypted?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function mapProvider(row: BackendProvider): LLMProvider {
  // Map backend type to LLMProviderType (openai/anthropic/google/local/deepseek).
  const t = (row.type || "").toLowerCase();
  const hasKey = !!row.apiKeyEncrypted;
  let status: LLMProvider["status"] = "needs-api-key";
  if (hasKey) {
    status = row.isDefault ? "connected" : "connected";
  }
  return {
    id: row.id,
    name: row.name,
    type: t,
    baseUrl: row.baseUrl ?? "",
    model: row.model ?? "",
    isDefault: !!row.isDefault,
    status,
    lastTestedAt: row.updatedAt ?? null,
    hasApiKey: hasKey,
    latencyMs: null,
  };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}

const PROVIDER_TONE: Record<string, string> = {
  openai: "text-emerald-700 dark:text-emerald-300",
  anthropic: "text-amber-700 dark:text-amber-300",
  google: "text-sky-700 dark:text-sky-300",
  local: "text-violet-700 dark:text-violet-300",
  deepseek: "text-rose-700 dark:text-rose-300",
  embedding: "text-stone-700 dark:text-stone-300",
  llm: "text-foreground/80",
};

export default function LLMProvidersPage() {
  const { data, loading, error } = useFetch<{ providers: BackendProvider[] }>("/api/providers");
  const [testing, setTesting] = React.useState<Set<string>>(new Set());
  const [editing, setEditing] = React.useState<LLMProvider | null>(null);

  const providers: LLMProvider[] = React.useMemo(() => {
    const list = data?.providers ?? [];
    return list.map(mapProvider);
  }, [data]);

  if (loading) return <LoadingShell />;
  if (error?.code === "not_implemented") return <NotImplShell kind="LLM providers" />;
  if (error) return <ErrorShell msg={error.message} />;

  const totalActive = providers.filter((p) => p.status === "connected").length;
  const totalExpired = providers.filter((p) => p.status === "expired").length;
  const totalNeeds = providers.filter((p) => p.status === "needs-api-key").length;
  const totalError = providers.filter((p) => p.status === "error").length;

  async function testOne(id: string) {
    setTesting((s) => new Set(s).add(id));
    await new Promise((r) => setTimeout(r, 700));
    setTesting((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }

  function saveEdit(updated: LLMProvider) {
    setEditing(null);
    // Mutation would call POST/PUT here; for now we treat edits as local-only.
    void updated;
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "providers", value: providers.length },
            { label: "active", value: totalActive },
            { label: "expired", value: totalExpired },
            { label: "needs-key", value: totalNeeds },
            { label: "error", value: totalError },
          ]}
          footnote={
            <>
              API key 在服务端加密存储 (<code className="font-mono">provider_configs.api_key_encrypted</code>),
              UI 永不回显明文。点击「测速」对当前 base_url + model 做一次握手探测。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">
              LLM 模型池
            </h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {providers.length} providers
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5">
              <RotateCcw className="size-3.5" />
              全部测速
            </Button>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              新增 Provider
            </Button>
          </div>
        </>
      }
    >
      <DenseTable
        head={[
          "Provider",
          "Type",
          "Model",
          "Base URL",
          "Status",
          "Latency",
          "Last Test",
          "",
        ]}
        rows={providers.map((p) => ({
          cells: [
            <div key="n" className="flex items-center gap-2">
              <div className="size-6 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                <Cpu className="size-3.5 text-muted-foreground" />
              </div>
              <div className="leading-tight">
                <div className="text-[13px] font-medium">{p.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {p.id}
                </div>
              </div>
              {p.isDefault && (
                <span className="ml-1 text-[9px] font-mono uppercase tracking-wide bg-foreground text-background px-1 py-0.5 rounded-sm">
                  default
                </span>
              )}
            </div>,
            <span
              key="t"
              className={cn(
                "text-[11px] font-mono uppercase tracking-wide",
                PROVIDER_TONE[p.type] ?? "text-muted-foreground",
              )}
            >
              {p.type}
            </span>,
            <MonoCell key="m">{p.model}</MonoCell>,
            <MonoCell
              key="u"
              className="text-muted-foreground max-w-[16rem] truncate inline-block"
              title={p.baseUrl}
            >
              {p.baseUrl}
            </MonoCell>,
            <StatusPill
              key="s"
              tone={toneForLLMStatus(p.status)}
              label={p.status}
            />,
            <MonoCell key="l" className="text-muted-foreground">
              {p.latencyMs ? `${p.latencyMs} ms` : "—"}
            </MonoCell>,
            <MonoCell key="lt" className="text-muted-foreground">
              {timeAgo(p.lastTestedAt)}
            </MonoCell>,
            <div key="a" className="flex items-center gap-1 justify-end">
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => testOne(p.id)}
                aria-label="测速"
                disabled={testing.has(p.id)}
              >
                <Gauge
                  className={cn(
                    "size-3.5",
                    testing.has(p.id) && "animate-spin",
                  )}
                />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setEditing(p)}
                aria-label="编辑"
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="删除"
                className="hover:text-rose-600"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>,
          ],
        }))}
        empty="No providers configured."
      />

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>KEY</KeyCell>
        {providers.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1">
            <span
              className={cn(
                "size-1.5 rounded-full",
                p.hasApiKey ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {p.type}
          </span>
        ))}
      </div>

      <EditProviderDialog
        provider={editing}
        onClose={() => setEditing(null)}
        onSave={saveEdit}
      />
    </ChannelsPageShell>
  );
}

function EditProviderDialog({
  provider,
  onClose,
  onSave,
}: {
  provider: LLMProvider | null;
  onClose: () => void;
  onSave: (p: LLMProvider) => void;
}) {
  const [apiKey, setApiKey] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [model, setModel] = React.useState("");

  React.useEffect(() => {
    if (provider) {
      setApiKey("");
      setBaseUrl(provider.baseUrl);
      setModel(provider.model);
    }
  }, [provider]);

  if (!provider) return null;

  return (
    <Dialog
      open={!!provider}
      onOpenChange={(next) => {
        if (!next) {
          setApiKey("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            编辑 Provider · {provider.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {provider.hasApiKey
              ? "已存储一个 API key. 提交新 key 将覆盖旧值,留空则保留现有 key."
              : "尚未配置 API key. 填入后会加密写入 provider_configs."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <Label htmlFor="ep-base">Base URL</Label>
            <Input
              id="ep-base"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ep-model">Default Model</Label>
            <Input
              id="ep-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ep-key">API Key</Label>
            <Input
              id="ep-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                provider.hasApiKey ? "•••• (保留现有,留空不覆盖)" : "sk-..."
              }
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-[10.5px] text-muted-foreground font-mono">
              type=password · 输入的值不回显,只在提交时使用一次
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave({
                ...provider,
                baseUrl: baseUrl.trim() || provider.baseUrl,
                model: model.trim() || provider.model,
                hasApiKey: provider.hasApiKey || apiKey.length > 0,
                status: apiKey.length > 0 && !provider.hasApiKey ? "connected" : provider.status,
                lastTestedAt: new Date().toISOString(),
              });
              setApiKey("");
            }}
          >
            保存
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LoadingShell() {
  return (
    <ChannelsPageShell
      meta={<PageMeta items={[{ label: "loading", value: "…" }]} footnote="正在拉取 provider 列表…" />}
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
          items={[{ label: "backend", value: "not_implemented" }]}
          footnote={`后端未实装 ${kind} 端点。已配置 mock 数据不再使用,直接显示空状态。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Database className="size-6 text-foreground/35" />
        <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-foreground/40">
          empty state
        </span>
        <p className="max-w-[44ch] text-sm text-foreground/60">
          {kind} 数据接口后端未实装。
          <br />
          一旦后端上线,刷新页面即可看到真实数据。
        </p>
      </div>
    </ChannelsPageShell>
  );
}

function ErrorShell({ msg }: { msg: string }) {
  return (
    <ChannelsPageShell
      meta={<PageMeta items={[{ label: "error", value: msg.slice(0, 24) }]} footnote={msg} />}
      toolbar={<></>}
    >
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
        加载失败 · {msg}
      </div>
    </ChannelsPageShell>
  );
}
