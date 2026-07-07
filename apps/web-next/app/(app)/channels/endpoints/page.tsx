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
} from "lucide-react";
import {
  MOCK_INBOUND,
  MOCK_OUTBOUND,
} from "@/lib/channels/mock";
import type {
  EndpointInbound,
  EndpointOutbound,
} from "@/lib/channels/types";

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

  const [outbound, setOutbound] = React.useState<EndpointOutbound[]>(MOCK_OUTBOUND);
  const [inbound, setInbound] = React.useState<EndpointInbound[]>(MOCK_INBOUND);

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
            <h2 className="text-sm font-semibold tracking-tight">Endpoints</h2>
            <span className="text-[11px] text-muted-foreground font-mono">
              双向 · {outbound.length + inbound.length}
            </span>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList variant="line">
              <TabsTrigger value="outbound" className="gap-1.5">
                <ArrowUpFromLine className="size-3.5" />
                Outbound · 我们接别人
              </TabsTrigger>
              <TabsTrigger value="inbound" className="gap-1.5">
                <ArrowDownToLine className="size-3.5" />
                Inbound · 别人接我们
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-2">
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" />
              新增{tab === "outbound" ? "出站通道" : "入站端点"}
            </Button>
          </div>
        </>
      }
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="-mt-2">
        <TabsContent value="outbound" className="mt-0">
          <DenseTable
            head={[
              "Channel",
              "Bot",
              "Webhook",
              "Purpose",
              "Remark",
              "Status",
              "",
            ]}
            rows={outbound.map((e) => ({
              cells: [
                <div key="ch" className="flex items-center gap-2.5">
                  <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                    <Cable className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[13px] font-medium">
                      {CHANNEL_LABEL[e.channel] ?? e.channel}
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.channel}
                    </div>
                  </div>
                </div>,
                <MonoCell key="bot" className="text-foreground/85">
                  {e.botName}
                </MonoCell>,
                <MonoCell
                  key="wh"
                  className="text-muted-foreground max-w-[20rem] truncate inline-block"
                  title={e.webhookUrl}
                >
                  {e.webhookUrl}
                </MonoCell>,
                <StatusPill
                  key="pur"
                  tone="muted"
                  dot={false}
                  label={e.purpose}
                  className="font-mono"
                />,
                <span
                  key="rem"
                  className="text-[11.5px] text-muted-foreground max-w-[14rem] truncate inline-block"
                  title={e.remark}
                >
                  {e.remark ?? "—"}
                </span>,
                <StatusPill key="s" tone={toneForEndpoint(e.status)} label={e.status} />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button size="icon-xs" variant="ghost" aria-label="编辑">
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
            empty="没有 outbound 通道."
          />
        </TabsContent>

        <TabsContent value="inbound" className="mt-0">
          <DenseTable
            head={[
              "Endpoint",
              "Callback URL",
              "Methods",
              "API",
              "Rate",
              "Status",
              "",
            ]}
            rows={inbound.map((e) => ({
              cells: [
                <div key="n" className="flex items-center gap-2.5">
                  <div className="size-7 rounded-sm bg-foreground/5 ring-1 ring-border grid place-items-center">
                    <ArrowDownToLine className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-[13px] font-medium font-mono">{e.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {e.id}
                    </div>
                  </div>
                </div>,
                <div key="cb" className="flex items-center gap-1.5">
                  <MonoCell
                    className="text-foreground/85 max-w-[24rem] truncate inline-block"
                    title={e.callbackUrl}
                  >
                    {e.callbackUrl}
                  </MonoCell>
                  <a
                    href={e.callbackUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="打开"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </div>,
                <div key="m" className="flex items-center gap-1">
                  {e.allowedMethods.map((m) => (
                    <span
                      key={m}
                      className="text-[10px] font-mono uppercase tracking-wide bg-muted text-muted-foreground px-1.5 py-0.5 rounded-sm"
                    >
                      {m}
                    </span>
                  ))}
                </div>,
                <MonoCell key="api" className="text-muted-foreground">
                  {e.apiVersion}
                </MonoCell>,
                <MonoCell key="rl" className="text-muted-foreground">
                  {e.rateLimit}
                </MonoCell>,
                <StatusPill key="s" tone={toneForEndpoint(e.status)} label={e.status} />,
                <div key="a" className="flex items-center gap-1 justify-end">
                  <Button size="icon-xs" variant="ghost" aria-label="编辑">
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
            empty="没有 inbound 端点."
          />
        </TabsContent>
      </Tabs>

      <div className="mt-3 flex items-center gap-3 text-[10.5px] text-muted-foreground font-mono">
        <KeyCell>NOTE</KeyCell>
        <span>
          Outbound 由 bot_configs.purpose 决定 · Inbound 由 callback_url 注册生成 ·
          Webhook URL 中的 token 不显示完整值
        </span>
      </div>
    </ChannelsPageShell>
  );
}