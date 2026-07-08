"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  StatusPill,
  toneForEndpoint,
} from "@/components/channels/status-pill";
import { ChannelsPageShell, PageMeta } from "@/components/channels/page-shell";
import { DenseTable, MonoCell, KeyCell } from "@/components/channels/dense-table";
import {
  Cable,
  ExternalLink,
  Pencil,
  Plus,
  Trash2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Inbox,
} from "lucide-react";
import type {
  EndpointInbound,
  EndpointOutbound,
} from "@/lib/channels/types";
import { useFetch } from "@/lib/channels/use-fetch";

/**
 * /channels/endpoints — 接入点双向.
 *
 * Tab 1: Outbound  (我们接别人) — bot 关联的 webhook 通道 (飞书/钉钉/企微).
 * Tab 2: Inbound   (别人接我们) — 我们对外暴露的 callback endpoint.
 *
 * The bot_configs.purpose field (A2) is used to partition: only
 * purpose in {outbound, both} shows on Outbound.
 */

const CHANNEL_LABEL: Record<string, string> = {
  feishu: "飞书",
  dingtalk: "钉钉",
  wechatwork: "企微",
  slack: "Slack",
  telegram: "Telegram",
};

export default function EndpointsPage() {
  const [tab, setTab] = React.useState<"outbound" | "inbound">("outbound");

  // Backend has IA v6 /api/v2/channels (endpoints view) — but the
  // outbound/inbound split lives in the legacy bot_configs table.
  // We gracefully fall back to empty state when neither endpoint is
  // wired for the expected payload shape.
  const {
    data: channelData,
    loading: chLoading,
    error: chError,
  } = useFetch<{ data?: { items?: any[] }; items?: any[] }>("/api/v2/channels");

  const endpoints: any[] =
    (channelData as any)?.data?.items ??
    (channelData as any)?.items ??
    [];

  if (chLoading) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "loading", value: "…" }]} />}
        toolbar={<></>}
      >
        <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
      </ChannelsPageShell>
    );
  }

  // Outbound/inbound split: backend endpoints view is unified; we treat
  // endpoint_type === 'inbound' / 'outbound' as the discriminator.
  const outbound: EndpointOutbound[] = endpoints
    .filter((e: any) => e.endpoint_type !== "inbound")
    .map((e: any) => ({
      id: e.id,
      channel: e.platform ?? "feishu",
      botName: e.display_name ?? e.name ?? "",
      webhookUrl: e.config?.webhook ?? "",
      status: e.is_active ? "active" : "paused",
      purpose: "outbound" as const,
      remark: e.remark ?? undefined,
    }));

  const inbound: EndpointInbound[] = endpoints
    .filter((e: any) => e.endpoint_type === "inbound")
    .map((e: any) => ({
      id: e.id,
      name: e.name ?? "",
      callbackUrl: e.config?.callback_url ?? "",
      allowedMethods: e.config?.methods ?? ["POST"],
      apiVersion: e.config?.api_version ?? "v1",
      rateLimit: e.config?.rate_limit ?? "60/min",
      status: e.is_active ? "active" as const : "paused" as const,
    }));

  if (chError?.code === "not_implemented" && endpoints.length === 0) {
    return <EmptyShell kind="Endpoints (双向通道)" />;
  }
  if (chError && endpoints.length === 0) {
    return (
      <ChannelsPageShell
        meta={<PageMeta items={[{ label: "error", value: chError.message.slice(0, 24) }]} />}
        toolbar={<></>}
      >
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-sm text-rose-700 dark:text-rose-300">
          加载失败 · {chError.message}
        </div>
      </ChannelsPageShell>
    );
  }

  const outboundActive = outbound.filter((e) => e.status === "active").length;
  const inboundActive = inbound.filter((e) => e.status === "active").length;

  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[
            { label: "outbound", value: outbound.length },
            { label: "active-ob", value: outboundActive },
            { label: "inbound", value: inbound.length },
            { label: "active-ib", value: inboundActive },
          ]}
          footnote={
            <>
              Outbound = 我们接别人(机器人对外发消息)。
              Inbound = 别人接我们(回调 URL 接外部事件)。
              A2 新字段 <code className="font-mono">bot_configs.purpose</code> 决定归类。
            </>
          }
        />
      }
      toolbar={
        <>
          <div className="flex items-center gap-2">
            <Cable className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">接入点 · 双向</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              {outbound.length + inbound.length} total
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5">
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
            Outbound · 我们接别人
            <span className="font-mono text-[10px] text-muted-foreground ml-1">
              {outbound.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="inbound" className="gap-1.5">
            <ArrowDownToLine className="size-3.5" />
            Inbound · 别人接我们
            <span className="font-mono text-[10px] text-muted-foreground ml-1">
              {inbound.length}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outbound" className="mt-4">
          <DenseTable
            head={["Channel", "Bot", "Webhook", "Status", ""]}
            rows={outbound.map((e) => ({
              cells: [
                <div key="ch" className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm">
                    {CHANNEL_LABEL[e.channel] ?? e.channel}
                  </span>
                </div>,
                <span key="b" className="text-[13px] font-medium">{e.botName}</span>,
                <MonoCell
                  key="u"
                  className="text-muted-foreground max-w-[20rem] truncate inline-block"
                  title={e.webhookUrl}
                >
                  {e.webhookUrl}
                </MonoCell>,
                <StatusPill
                  key="s"
                  tone={toneForEndpoint(e.status)}
                  label={e.status}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button size="icon-xs" variant="ghost" aria-label="编辑">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="删除" className="hover:text-rose-600">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty={
              outbound.length === 0
                ? "暂无 outbound 配置 · 后端 endpoints view 未返回数据。"
                : "没有匹配的 endpoint."
            }
          />
        </TabsContent>

        <TabsContent value="inbound" className="mt-4">
          <DenseTable
            head={["Name", "Callback URL", "Methods", "Version", "Rate Limit", "Status", ""]}
            rows={inbound.map((e) => ({
              cells: [
                <div key="n" className="flex items-center gap-2">
                  <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                  <span className="text-[13px] font-medium">{e.name}</span>
                </div>,
                <MonoCell
                  key="u"
                  className="text-muted-foreground max-w-[24rem] truncate inline-block"
                  title={e.callbackUrl}
                >
                  {e.callbackUrl}
                </MonoCell>,
                <MonoCell key="m" className="text-muted-foreground">
                  {e.allowedMethods.join(", ")}
                </MonoCell>,
                <MonoCell key="v" className="text-muted-foreground">v{e.apiVersion}</MonoCell>,
                <MonoCell key="r" className="text-muted-foreground">{e.rateLimit}</MonoCell>,
                <StatusPill
                  key="s"
                  tone={toneForEndpoint(e.status)}
                  label={e.status}
                />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button size="icon-xs" variant="ghost" aria-label="查看">
                    <ExternalLink className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="编辑">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label="删除" className="hover:text-rose-600">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>,
              ],
            }))}
            empty={
              inbound.length === 0
                ? "暂无 inbound 配置 · 后端 endpoints view 未返回数据。"
                : "没有匹配的 endpoint."
            }
          />
        </TabsContent>
      </Tabs>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>NOTE</KeyCell>
        <span>所有 webhook URL 脱敏展示 · 真实值加密存于 bot_configs</span>
      </div>
    </ChannelsPageShell>
  );
}

function EmptyShell({ kind }: { kind: string }) {
  return (
    <ChannelsPageShell
      meta={
        <PageMeta
          items={[{ label: "backend", value: "not_implemented" }]}
          footnote={`后端未实装 ${kind} 端点 · 已废弃 mock.ts 引用,改为显示空状态。`}
        />
      }
      toolbar={<></>}
    >
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border py-24 text-center">
        <Inbox className="size-6 text-foreground/35" />
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
