"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import { StatusPill, toneForEndpoint } from "@/components/channels/status-pill";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Cable,
  Inbox,
  Link2,
  MessageSquare,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  Loader2,
} from "lucide-react";
import { useFetch } from "@/lib/channels/use-fetch";
import { mutate } from "@/lib/channels/api-mutations";

/**
 * /channels/endpoints — 接入点双向
 *
 * 出站(Outbound) = 我们接别人 (飞书/微信/企微/WhatsApp bot)
 * 入站(Inbound)  = 别人接我们 (Webhook URL 接外部事件)
 *
 * 数据源: bot_configs 表
 *   purpose = 'outbound' → 出站 tab
 *   purpose = 'inbound'  → 入站 tab
 */

type Platform = "feishu" | "wechat" | "wechatwork" | "whatsapp" | "webhook";

const PLATFORM_LABEL: Record<Platform, string> = {
  feishu: "飞书",
  wechat: "微信",
  wechatwork: "企微",
  whatsapp: "WhatsApp",
  webhook: "Webhook",
};

// R68-4 · 块 9: 每个平台的接入手注释(去飞书/企微后台对照填即可)
const PLATFORM_HINT: Record<Platform, string> = {
  feishu:
    "飞书开放平台 → 应用后台 → 凭证页 拿 App ID / App Secret;事件订阅页 拿 Verification Token 与 Encrypt Key。回调 URL 在本平台「入站」Tab 复制。",
  wechat:
    "微信公众号后台 → 开发→基本配置 拿 AppID / AppSecret / 令牌(Token)/消息加解密密钥。服务器地址(URL)在「入站」Tab 复制。",
  wechatwork:
    "企业微信管理后台 → 应用管理→自建应用 拿 AgentId / Secret;「客户联系」/「接收事件服务器」拿 Token / EncodingAESKey。",
  whatsapp:
    "Meta for Developers → WhatsApp→API Setup 拿 Phone Number ID / Access Token / Verify Token。Webhook Callback URL 在「入站」Tab 复制。",
  webhook:
    "通用 Webhook 出/入站:URL 字段填完整 https 地址,Secret 用于签名校验(HMAC-SHA256)。",
};

const PLATFORM_FIELDS: Record<
  Platform,
  Array<{ key: string; label: string; placeholder: string }>
> = {
  feishu: [
    { key: "appId", label: "应用 ID", placeholder: "cli_xxx" },
    { key: "appSecret", label: "应用密钥", placeholder: "xxx" },
    { key: "verificationToken", label: "校验 Token", placeholder: "xxx" },
    { key: "encryptKey", label: "加密密钥", placeholder: "xxx" },
  ],
  wechat: [
    { key: "corpId", label: "企业 ID", placeholder: "wx_xxx" },
    { key: "agentId", label: "数字员工 ID", placeholder: "1000001" },
    { key: "secret", label: "密钥", placeholder: "xxx" },
    { key: "token", label: "令牌", placeholder: "xxx" },
  ],
  wechatwork: [
    { key: "corpId", label: "企业 ID", placeholder: "ww_xxx" },
    { key: "agentId", label: "数字员工 ID", placeholder: "1000001" },
    { key: "secret", label: "密钥", placeholder: "xxx" },
    { key: "token", label: "令牌", placeholder: "xxx" },
  ],
  whatsapp: [
    { key: "phoneNumberId", label: "手机号 ID", placeholder: "123" },
    { key: "accessToken", label: "访问令牌", placeholder: "EAAGxxx" },
    { key: "verifyToken", label: "Verify Token (Webhook)", placeholder: "xxx" },
  ],
  webhook: [
    { key: "url", label: "地址", placeholder: "https://partner.example.com/hook" },
    { key: "secret", label: "签名 Secret", placeholder: "xxx" },
  ],
};

interface Endpoint {
  id: string;
  name: string;
  displayName?: string;
  platform: Platform;
  config?: Record<string, any>;
  isActive: boolean;
  isHealthy?: boolean;
  purpose: "outbound" | "inbound";
  remark?: string;
  botId?: string;
  lastHealthCheckAt?: string;
}

// R51-D2 + D3: 入口绑定状态(从 /api/bots JOIN bot_configs.agent_id 拉)
// - boundAgentName: null = 未绑,string = 已绑,值是 agent 的 display name
interface BotBinding {
  botName: string;
  boundAgentId: string | null;
  boundAgentName: string | null;
}

export default function EndpointsPage() {
  const [tab, setTab] = React.useState<"outbound" | "inbound">("outbound");

  const {
    data: obData,
    loading: obLoading,
    error: obError,
    refresh: refreshOb,
  } = useFetch<{ data?: { items?: Endpoint[] } }>(
    "/api/v2/channels/endpoints?purpose=outbound",
  );
  const {
    data: ibData,
    loading: ibLoading,
    error: ibError,
    refresh: refreshIb,
  } = useFetch<{ data?: { items?: Endpoint[] } }>(
    "/api/v2/channels/endpoints?purpose=inbound",
  );

  const outbound = obData?.data?.items ?? [];
  const inbound = ibData?.data?.items ?? [];

  // R51-D2: 拉 /api/bots 拿每个 bot 的绑定状态(已绑 agent / 未绑)
  //   /api/v2/channels/endpoints 不返回 agent_id,只能从权威来源 /api/bots 拿
  const { data: botsData } = useFetch<{ bots?: Array<{ name: string; agent_id?: string | null; agent_name?: string | null }> }>(
    "/api/bots",
  );
  const bindingByBotName = React.useMemo(() => {
    const m = new Map<string, BotBinding>();
    for (const b of botsData?.bots ?? []) {
      m.set(b.name, {
        botName: b.name,
        boundAgentId: b.agent_id ?? null,
        boundAgentName: b.agent_name ?? null,
      });
    }
    return m;
  }, [botsData]);

  function bindingFor(e: Endpoint): BotBinding | null {
    return bindingByBotName.get(e.name) ?? null;
  }

  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<Endpoint | null>(null);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  const loading = obLoading || ibLoading;
  const error = obError || ibError;

  if (loading) {
    return (
      <ChannelsPageShell meta={<PageMeta items={[{ label: "加载", value: "…" }]} />} toolbar={<></>}>
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  if (error && outbound.length === 0 && inbound.length === 0) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "错误", value: error.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {error.message}
        </div>
      </ChannelsPageShell>
    );
  }

  const outboundActive = outbound.filter((e) => e.isActive).length;
  const inboundActive = inbound.filter((e) => e.isActive).length;

  async function toggleActive(e: Endpoint, purpose: "outbound" | "inbound") {
    setBusy(true);
    const r = await mutate("PATCH", `/api/v2/channels/endpoints/${e.id}`, {
      body: { isActive: !e.isActive },
      refresh: purpose === "outbound" ? refreshOb : refreshIb,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已${!e.isActive ? "启用" : "停用"} ${e.name}` : `✗ ${r.error}`);
  }

  async function remove(e: Endpoint, purpose: "outbound" | "inbound") {
    if (!confirm(`删除接入点 "${e.name}"?`)) return;
    setBusy(true);
    const r = await mutate("DELETE", `/api/v2/channels/endpoints/${e.id}`, {
      refresh: purpose === "outbound" ? refreshOb : refreshIb,
    });
    setBusy(false);
    notify(r.ok ? `✓ 已删除 ${e.name}` : `✗ ${r.error}`);
  }

  function getWebhookUrl(e: Endpoint): string {
    if (!e.config) return "—";
    return (
      e.config.webhook ||
      e.config.webhookUrl ||
      e.config.webhook_url ||
      e.config.callback_url ||
      e.config.callbackUrl ||
      "—"
    );
  }

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "出站", value: outbound.length },
            { label: "出站启用", value: outboundActive },
            { label: "入站", value: inbound.length },
            { label: "入站启用", value: inboundActive },
          ]}
          footnote={
            <>
              出站(Outbound) = 我们接别人(机器人对外发消息:飞书/微信/企微/WhatsApp)。
              入站(Inbound) = 别人接我们(Webhook URL 接外部事件)。
              数据存储于 <code className="font-mono">bot_configs</code> 表。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Cable className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">访问入口 · 双向</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {outbound.length + inbound.length} 个
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => {
                refreshOb();
                refreshIb();
              }}
            >
              <RefreshCw className="size-3.5" />
              刷新
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
              <Plus className="size-3.5" />
              新增接入点
            </Button>
          </div>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as "outbound" | "inbound")}>
        <TabsList>
          <TabsTrigger value="outbound" className="gap-1.5">
            <ArrowUpFromLine className="size-3.5" />
            出站 · 我们接别人
            <span className="font-mono text-[10px] text-muted-foreground ml-1">
              {outbound.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="inbound" className="gap-1.5">
            <ArrowDownToLine className="size-3.5" />
            入站 · 别人接我们
            <span className="font-mono text-[10px] text-muted-foreground ml-1">
              {inbound.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outbound" className="mt-4">
          <DenseTable
            head={["频道", "Bot 名称", "输入来源", "绑定状态", "Webhook", "备注", "状态", ""]}
            rows={outbound.map((e) => {
              const channelLabel = PLATFORM_LABEL[e.platform as Platform] ?? e.platform;
              const botLabel = e.displayName ?? e.name;
              const bind = bindingFor(e);
              return {
                cells: [
                <span
                  key="ch"
                  className="font-mono text-[11px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                >
                  {channelLabel}
                </span>,
                <div key="b" className="leading-tight">
                  <div className="text-[13px] font-medium">{botLabel}</div>
                  {e.botId ? (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.botId.slice(0, 8)}
                    </div>
                  ) : null}
                </div>,
                <span
                  key="src"
                  className="font-mono text-[10.5px] text-foreground/70"
                  title={`输入来源 = ${channelLabel} · ${botLabel}`}
                  data-testid={`endpoint-source-${e.id.slice(0, 8)}`}
                >
                  {channelLabel} · {botLabel}
                </span>,
                bind?.boundAgentId ? (
                  <span
                    key="bd"
                    className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300 w-fit"
                    data-testid={`endpoint-bound-${e.id.slice(0, 8)}`}
                    title={`已绑定到数字员工 ${bind.boundAgentName ?? bind.boundAgentId.slice(0, 8)}`}
                  >
                    <Link2 className="size-2.5" />
                    已绑 · {bind.boundAgentName ?? bind.boundAgentId.slice(0, 8)}
                  </span>
                ) : (
                  <span
                    key="bd"
                    className="shrink-0 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground w-fit"
                    data-testid={`endpoint-free-${e.id.slice(0, 8)}`}
                    title="该入口尚未绑定到任何数字员工"
                  >
                    未绑
                  </span>
                ),
                <MonoCell
                  key="u"
                  className="text-muted-foreground max-w-[20rem] truncate inline-block"
                  title={getWebhookUrl(e)}
                >
                  {getWebhookUrl(e)}
                </MonoCell>,
                <MonoCell key="r" className="text-muted-foreground">
                  {e.remark || "—"}
                </MonoCell>,
                <StatusPill
                  key="s"
                  tone={e.isActive ? toneForEndpoint("active") : toneForEndpoint("paused")}
                  label={e.isActive ? "启用" : "停用"}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => toggleActive(e, "outbound")}
                    disabled={busy}
                    aria-label={e.isActive ? "停用" : "启用"}
                    title={e.isActive ? "停用" : "启用"}
                  >
                    {e.isActive ? (
                      <PowerOff className="size-3.5" />
                    ) : (
                      <Power className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="编辑"
                    onClick={() => setEditing(e)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="删除"
                    className="hover:text-rose-600"
                    onClick={() => remove(e, "outbound")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
              };
            })}
            empty={
              outbound.length === 0
                ? "暂无出站接入点 · 点击「新增接入点」开始添加飞书/微信/WhatsApp bot"
                : "没有匹配的接入点"
            }
          />
        </TabsContent>

        <TabsContent value="inbound" className="mt-4">
          <DenseTable
            head={["频道", "Bot 名称", "输入来源", "绑定状态", "回调 URL", "方法", "状态", ""]}
            rows={inbound.map((e) => {
              const channelLabel = PLATFORM_LABEL[e.platform as Platform] ?? e.platform;
              const botLabel = e.displayName ?? e.name;
              const bind = bindingFor(e);
              return {
                cells: [
                <span
                  key="ch"
                  className="font-mono text-[11px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                >
                  {channelLabel}
                </span>,
                <div key="n" className="leading-tight">
                  <div className="text-[13px] font-medium">{botLabel}</div>
                  {e.botId ? (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.botId.slice(0, 8)}
                    </div>
                  ) : null}
                </div>,
                <span
                  key="src"
                  className="font-mono text-[10.5px] text-foreground/70"
                  title={`输入来源 = ${channelLabel} · ${botLabel}`}
                  data-testid={`endpoint-source-in-${e.id.slice(0, 8)}`}
                >
                  {channelLabel} · {botLabel}
                </span>,
                bind?.boundAgentId ? (
                  <span
                    key="bd"
                    className="shrink-0 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700 dark:text-emerald-300 w-fit"
                    data-testid={`endpoint-bound-in-${e.id.slice(0, 8)}`}
                    title={`已绑定到数字员工 ${bind.boundAgentName ?? bind.boundAgentId.slice(0, 8)}`}
                  >
                    <Link2 className="size-2.5" />
                    已绑 · {bind.boundAgentName ?? bind.boundAgentId.slice(0, 8)}
                  </span>
                ) : (
                  <span
                    key="bd"
                    className="shrink-0 inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground w-fit"
                    data-testid={`endpoint-free-in-${e.id.slice(0, 8)}`}
                    title="该入口尚未绑定到任何数字员工"
                  >
                    未绑
                  </span>
                ),
                <MonoCell
                  key="u"
                  className="text-muted-foreground max-w-[24rem] truncate inline-block"
                  title={getWebhookUrl(e)}
                >
                  {getWebhookUrl(e)}
                </MonoCell>,
                <MonoCell key="m" className="text-muted-foreground">
                  {(e.config?.methods ?? e.config?.allowedMethods ?? ["POST"]).join(", ")}
                </MonoCell>,
                <StatusPill
                  key="s"
                  tone={e.isActive ? toneForEndpoint("active") : toneForEndpoint("paused")}
                  label={e.isActive ? "启用" : "停用"}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => toggleActive(e, "inbound")}
                    disabled={busy}
                    aria-label={e.isActive ? "停用" : "启用"}
                  >
                    {e.isActive ? (
                      <PowerOff className="size-3.5" />
                    ) : (
                      <Power className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="编辑"
                    onClick={() => setEditing(e)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="删除"
                    className="hover:text-rose-600"
                    onClick={() => remove(e, "inbound")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
              };
            })}
            empty={inbound.length === 0 ? "暂无入站接入点 · 点击「新增接入点」添加 Webhook" : "没有匹配的接入点"}
          />
        </TabsContent>
      </Tabs>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>说明</KeyCell>
        <span>所有 webhook URL 脱敏展示 · 真实值加密存于 bot_configs.config_json</span>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg bg-foreground text-background px-3.5 py-2 text-xs shadow-lg">
          {toast}
        </div>
      )}

      <EndpointDialog
        open={creating || !!editing}
        editing={editing}
        defaultPurpose={tab}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          refreshOb();
          refreshIb();
        }}
      />
    </ChannelsPageShell>
  );
}

function EndpointDialog({
  open,
  editing,
  defaultPurpose,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Endpoint | null;
  defaultPurpose: "outbound" | "inbound";
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [purpose, setPurpose] = React.useState<"outbound" | "inbound">(defaultPurpose);
  const [platform, setPlatform] = React.useState<Platform>("feishu");
  const [name, setName] = React.useState("");
  const [remark, setRemark] = React.useState("");
  const [config, setConfig] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setPurpose(editing.purpose === "inbound" ? "inbound" : "outbound");
      setPlatform((editing.platform as Platform) ?? "feishu");
      setName(editing.name);
      setRemark(editing.remark ?? "");
      const cfg: Record<string, string> = {};
      Object.entries(editing.config ?? {}).forEach(([k, v]) => {
        if (typeof v === "string" || typeof v === "number") cfg[k] = String(v);
      });
      setConfig(cfg);
    } else {
      setPurpose(defaultPurpose);
      setPlatform("feishu");
      setName("");
      setRemark("");
      setConfig({});
    }
    setErr(null);
  }, [open, editing, defaultPurpose]);

  if (!open) return null;

  function updateConfig(key: string, val: string) {
    setConfig((c) => ({ ...c, [key]: val }));
  }

  async function save() {
    if (!name.trim()) {
      setErr("名称必填");
      return;
    }
    setSaving(true);
    setErr(null);
    const body: Record<string, any> = {
      name: name.trim(),
      platform,
      purpose,
      isActive: true,
      remark: remark.trim(),
      config,
    };
    const r = isEdit
      ? await mutate("PATCH", `/api/v2/channels/endpoints/${editing!.id}`, { body })
      : await mutate("POST", "/api/v2/channels/endpoints", { body });
    setSaving(false);
    if (r.ok) onSaved();
    else setErr(r.error || "保存失败");
  }

  const fields = purpose === "inbound"
    ? [
        { key: "callback_url", label: "回调 URL", placeholder: "https://api.panmira.io/v1/hooks/feishu" },
        { key: "secret", label: "签名 Secret", placeholder: "用于校验请求来源" },
      ]
    : PLATFORM_FIELDS[platform];

  return (
    <Dialog open={open} onOpenChange={(n) => !n && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Cable className="size-4 text-muted-foreground" />
            {isEdit ? `编辑接入点 · ${editing!.name}` : "新增接入点"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {purpose === "outbound"
              ? "出站 = 我们接别人(机器人对外发消息)"
              : "入站 = 别人接我们(Webhook URL 接收外部事件)"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>方向</Label>
              <Select
                value={purpose}
                onValueChange={(v) => setPurpose(v as "outbound" | "inbound")}
                disabled={isEdit}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">出站(我们接别人)</SelectItem>
                  <SelectItem value="inbound">入站(别人接我们)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {purpose === "outbound" ? (
              <div className="space-y-1">
                <Label>频道类型</Label>
                <Select
                  value={platform}
                  onValueChange={(v) => setPlatform(v as Platform)}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feishu">飞书</SelectItem>
                    <SelectItem value="wechat">微信</SelectItem>
                    <SelectItem value="wechatwork">企微</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="webhook">Webhook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ep-name">Bot 名称</Label>
            <Input
              id="ep-name"
              placeholder="玄鉴"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {/* R68-4 · 块 9: 平台对应平台注释 — 选哪个平台显示哪段提示 */}
          <div className="rounded-sm ring-1 ring-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <span className="font-mono uppercase tracking-wide text-[10px] mr-1.5 text-foreground/70">{PLATFORM_LABEL[platform]}</span>
            {PLATFORM_HINT[platform]}
          </div>
          <div className="space-y-1.5">
            {fields.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`ep-${f.key}`}>{f.label}</Label>
                <Input
                  id={`ep-${f.key}`}
                  placeholder={f.placeholder}
                  value={config[f.key] ?? ""}
                  onChange={(e) => updateConfig(f.key, e.target.value)}
                  className="font-mono text-[11.5px]"
                />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="ep-remark">备注</Label>
            <Input
              id="ep-remark"
              placeholder="可选,用于区分用途"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
            />
          </div>
          {err ? (
            <div className="rounded-md bg-rose-500/10 ring-1 ring-rose-500/30 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
