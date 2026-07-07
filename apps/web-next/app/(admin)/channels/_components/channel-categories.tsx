"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertTriangle } from "lucide-react";
import type { ChannelCreate } from "./types";

// ============ Channel 类型分类 ============

export type ChannelCategory =
  | "feishu"
  | "wechat"
  | "telegram"
  | "webhook"
  | "cli"
  | "custom";

export interface ChannelCategoryMeta {
  key: ChannelCategory;
  label: string;
  emoji: string;
  description: string;
  hint: string;
}

export const CATEGORIES: ChannelCategoryMeta[] = [
  {
    key: "feishu",
    label: "飞书",
    emoji: "🪶",
    description: "飞书机器人 / 群消息",
    hint: "需要飞书开放平台 app_id + app_secret",
  },
  {
    key: "wechat",
    label: "微信",
    emoji: "💬",
    description: "企业微信应用",
    hint: "需要企业微信 corp_id + agent_id + secret",
  },
  {
    key: "telegram",
    label: "Telegram",
    emoji: "✈️",
    description: "Telegram Bot API",
    hint: "需要 BotFather 生成的 bot_token",
  },
  {
    key: "webhook",
    label: "Webhook",
    emoji: "🔗",
    description: "HTTP 回调,接收外部系统推送",
    hint: "URL + Secret,外部 POST 进来",
  },
  {
    key: "cli",
    label: "CLI",
    emoji: "⌨️",
    description: "命令行工具,本地 / 远程执行",
    hint: "命令模板 + 工作目录 + 环境变量",
  },
  {
    key: "custom",
    label: "自定义",
    emoji: "🛠️",
    description: "通用路由绑定 (旧模式,简易配置)",
    hint: "group + pattern + targetBots",
  },
];

export function getCategoryMeta(key: string | null | undefined): ChannelCategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

// ============ 各类别配置表单 ============

export interface CategoryFormValues {
  category: ChannelCategory;
  targetBots: string[];
  priority: number;
  enabled: boolean;
  feishuAppId?: string;
  feishuAppSecret?: string;
  feishuBotName?: string;
  feishuCallbackUrl?: string;
  wechatCorpId?: string;
  wechatAgentId?: string;
  wechatSecret?: string;
  wechatToken?: string;
  telegramBotToken?: string;
  telegramChatIds?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEventFilter?: string[];
  webhookForwardTo?: "agent" | "channel";
  cliCommandTemplate?: string;
  cliWorkingDir?: string;
  cliEnvVars?: Record<string, string>;
  cliPermissions?: string[];
  groupId?: string;
  pattern?: string;
}

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: ChannelCategory | null;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
}

export function CategoryChannelDialog({ open, onOpenChange, category, onSubmit }: DialogProps) {
  const [vals, setVals] = useState<CategoryFormValues>(getDefaults());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVals({ ...getDefaults(), category: category ?? "custom" });
      setError(null);
    }
  }, [open, category]);

  if (!category) return null;
  const meta = getCategoryMeta(category);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (vals.targetBots.length === 0) {
      setError("至少配置一个 Target Bot");
      return;
    }
    setLoading(true);
    try {
      await onSubmit(vals);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{meta.emoji}</span>
            新建 {meta.label} Channel
          </DialogTitle>
          <DialogDescription>{meta.hint}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handle} className="space-y-4">
          {category === "feishu" && (
            <Fieldset legend="飞书配置">
              <Field id="feishu-app-id" label="App ID *">
                <Input
                  id="feishu-app-id"
                  value={vals.feishuAppId ?? ""}
                  onChange={(e) => setVals({ ...vals, feishuAppId: e.target.value })}
                  placeholder="cli_xxxxxxxx"
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="feishu-app-secret" label="App Secret *">
                <Input
                  id="feishu-app-secret"
                  type="password"
                  value={vals.feishuAppSecret ?? ""}
                  onChange={(e) => setVals({ ...vals, feishuAppSecret: e.target.value })}
                  placeholder="xxxxxxxxxxxxxx"
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="feishu-bot-name" label="机器人名称">
                <Input
                  id="feishu-bot-name"
                  value={vals.feishuBotName ?? ""}
                  onChange={(e) => setVals({ ...vals, feishuBotName: e.target.value })}
                  placeholder="得一·销售助手"
                />
              </Field>
              <Field id="feishu-callback" label="回调 URL (留空使用系统默认)">
                <Input
                  id="feishu-callback"
                  value={vals.feishuCallbackUrl ?? ""}
                  onChange={(e) => setVals({ ...vals, feishuCallbackUrl: e.target.value })}
                  placeholder="https://your-domain.com/webhook/feishu"
                  className="font-mono text-xs"
                />
              </Field>
            </Fieldset>
          )}

          {category === "wechat" && (
            <Fieldset legend="企业微信配置">
              <Field id="wechat-corp-id" label="Corp ID *">
                <Input
                  id="wechat-corp-id"
                  value={vals.wechatCorpId ?? ""}
                  onChange={(e) => setVals({ ...vals, wechatCorpId: e.target.value })}
                  placeholder="ww1234567890abcdef"
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="wechat-agent-id" label="Agent ID *">
                <Input
                  id="wechat-agent-id"
                  value={vals.wechatAgentId ?? ""}
                  onChange={(e) => setVals({ ...vals, wechatAgentId: e.target.value })}
                  placeholder="1000002"
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="wechat-secret" label="应用 Secret *">
                <Input
                  id="wechat-secret"
                  type="password"
                  value={vals.wechatSecret ?? ""}
                  onChange={(e) => setVals({ ...vals, wechatSecret: e.target.value })}
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="wechat-token" label="回调 Token (校验用)">
                <Input
                  id="wechat-token"
                  value={vals.wechatToken ?? ""}
                  onChange={(e) => setVals({ ...vals, wechatToken: e.target.value })}
                  placeholder="可选 · 用于回调验证"
                  className="font-mono"
                />
              </Field>
            </Fieldset>
          )}

          {category === "telegram" && (
            <Fieldset legend="Telegram Bot 配置">
              <Field id="tg-token" label="Bot Token *">
                <Input
                  id="tg-token"
                  type="password"
                  value={vals.telegramBotToken ?? ""}
                  onChange={(e) => setVals({ ...vals, telegramBotToken: e.target.value })}
                  placeholder="123456:ABC-DEF..."
                  required
                  className="font-mono"
                />
              </Field>
              <Field id="tg-chats" label="允许的 Chat ID (逗号分隔)">
                <Input
                  id="tg-chats"
                  value={(vals.telegramChatIds ?? []).join(",")}
                  onChange={(e) => setVals({
                    ...vals,
                    telegramChatIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })}
                  placeholder="-1001234567890, -1009876543210"
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  留空表示接受所有 chat · 多个用逗号分隔
                </p>
              </Field>
            </Fieldset>
          )}

          {category === "webhook" && (
            <Fieldset legend="Webhook 配置">
              <Field id="wh-url" label="URL (系统生成 · 不可改)">
                <Input
                  id="wh-url"
                  value={vals.webhookUrl ?? ""}
                  onChange={(e) => setVals({ ...vals, webhookUrl: e.target.value })}
                  placeholder="留空,系统自动生成 https://api.example.com/hooks/xxx"
                  className="font-mono text-xs"
                  readOnly
                />
                <p className="text-[11px] text-muted-foreground">
                  提交后系统会生成一个唯一的 webhook URL 和 secret token
                </p>
              </Field>
              <Field id="wh-event-filter" label="事件过滤 (逗号分隔,空 = 全部)">
                <Input
                  id="wh-event-filter"
                  value={(vals.webhookEventFilter ?? []).join(",")}
                  onChange={(e) => setVals({
                    ...vals,
                    webhookEventFilter: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })}
                  placeholder="order.created,invoice.paid"
                  className="font-mono text-xs"
                />
              </Field>
              <Field id="wh-forward" label="触发动作">
                <select
                  id="wh-forward"
                  value={vals.webhookForwardTo ?? "agent"}
                  onChange={(e) => setVals({ ...vals, webhookForwardTo: e.target.value as "agent" | "channel" })}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="agent">转发到 Agent (targetBots)</option>
                  <option value="channel">转发到另一个 Channel (级联)</option>
                </select>
              </Field>
            </Fieldset>
          )}

          {category === "cli" && (
            <Fieldset legend="CLI 配置">
              <Field id="cli-cmd" label="命令模板 *">
                <Input
                  id="cli-cmd"
                  value={vals.cliCommandTemplate ?? ""}
                  onChange={(e) => setVals({ ...vals, cliCommandTemplate: e.target.value })}
                  placeholder='echo "{{input}}" | ./agent-runner.sh'
                  required
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  支持 <code className="font-mono">{"{{input}}"}</code> 和 <code className="font-mono">{"{{bot}}"}</code> 占位符
                </p>
              </Field>
              <Field id="cli-cwd" label="工作目录">
                <Input
                  id="cli-cwd"
                  value={vals.cliWorkingDir ?? ""}
                  onChange={(e) => setVals({ ...vals, cliWorkingDir: e.target.value })}
                  placeholder="/opt/agent-runner"
                  className="font-mono"
                />
              </Field>
              <Field id="cli-env" label="环境变量 (KEY=value 每行一个)">
                <textarea
                  id="cli-env"
                  rows={4}
                  value={Object.entries(vals.cliEnvVars ?? {}).map(([k, v]) => `${k}=${v}`).join("\n")}
                  onChange={(e) => {
                    const obj: Record<string, string> = {};
                    e.target.value.split("\n").forEach((line) => {
                      const [k, ...rest] = line.split("=");
                      if (k && rest.length > 0) obj[k.trim()] = rest.join("=").trim();
                    });
                    setVals({ ...vals, cliEnvVars: obj });
                  }}
                  placeholder="OPENAI_API_KEY=sk-xxx&#10;LOG_LEVEL=info"
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </Field>
              <Field id="cli-perm" label="权限范围 (逗号分隔)">
                <Input
                  id="cli-perm"
                  value={(vals.cliPermissions ?? []).join(",")}
                  onChange={(e) => setVals({
                    ...vals,
                    cliPermissions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                  })}
                  placeholder="network,filesystem:read,filesystem:write"
                  className="font-mono text-xs"
                />
              </Field>
            </Fieldset>
          )}

          {category === "custom" && (
            <Fieldset legend="自定义路由">
              <Field id="group-id" label="Group ID (如飞书群 oc_xxx)">
                <Input
                  id="group-id"
                  value={vals.groupId ?? ""}
                  onChange={(e) => setVals({ ...vals, groupId: e.target.value })}
                  placeholder="oc_xxx / chat_xxx"
                  className="font-mono"
                />
              </Field>
              <Field id="pattern" label="Pattern (匹配规则)">
                <Input
                  id="pattern"
                  value={vals.pattern ?? ""}
                  onChange={(e) => setVals({ ...vals, pattern: e.target.value })}
                  placeholder="feishu:group:oc_xxx"
                  className="font-mono"
                />
              </Field>
            </Fieldset>
          )}

          <Fieldset legend="通用配置">
            <Field id="target-bots" label="Target Bots (Agent 名称,逗号分隔) *">
              <Input
                id="target-bots"
                value={vals.targetBots.join(",")}
                onChange={(e) => setVals({
                  ...vals,
                  targetBots: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
                placeholder="sales-bot, support-bot"
                required
                className="font-mono"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="priority" label="优先级 (0-100)">
                <Input
                  id="priority"
                  type="number"
                  value={vals.priority}
                  onChange={(e) => setVals({ ...vals, priority: Number(e.target.value) })}
                  min={0}
                  max={100}
                />
              </Field>
              <Field id="enabled" label="">
                <label className="flex items-center gap-2 text-sm h-9">
                  <input
                    type="checkbox"
                    checked={vals.enabled}
                    onChange={(e) => setVals({ ...vals, enabled: e.target.checked })}
                  />
                  启用
                </label>
              </Field>
            </div>
          </Fieldset>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="size-3" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              创建 Channel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============ Helpers ============

function getDefaults(): CategoryFormValues {
  return {
    category: "custom",
    targetBots: [],
    priority: 50,
    enabled: true,
    telegramChatIds: [],
    webhookEventFilter: [],
    webhookForwardTo: "agent",
    cliEnvVars: {},
    cliPermissions: [],
  };
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="text-xs font-medium text-muted-foreground px-1">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  id, label, children,
}: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      {children}
    </div>
  );
}

// ============ 把 CategoryFormValues 映射为后端 ChannelCreate ============

export function toChannelCreate(vals: CategoryFormValues): ChannelCreate {
  const base: ChannelCreate = {
    targetBots: vals.targetBots,
    priority: vals.priority,
    enabled: vals.enabled,
  };
  if (vals.groupId) base.groupId = vals.groupId;
  if (vals.pattern) base.pattern = vals.pattern;
  const meta: Record<string, unknown> = {
    category: vals.category,
  };
  if (vals.feishuAppId) meta.feishu = {
    appId: vals.feishuAppId,
    appSecret: vals.feishuAppSecret,
    botName: vals.feishuBotName,
    callbackUrl: vals.feishuCallbackUrl,
  };
  if (vals.wechatCorpId) meta.wechat = {
    corpId: vals.wechatCorpId,
    agentId: vals.wechatAgentId,
    secret: vals.wechatSecret,
    token: vals.wechatToken,
  };
  if (vals.telegramBotToken) meta.telegram = {
    botToken: vals.telegramBotToken,
    chatIds: vals.telegramChatIds,
  };
  if (vals.category === "webhook") meta.webhook = {
    eventFilter: vals.webhookEventFilter,
    forwardTo: vals.webhookForwardTo,
  };
  if (vals.cliCommandTemplate) meta.cli = {
    commandTemplate: vals.cliCommandTemplate,
    workingDir: vals.cliWorkingDir,
    envVars: vals.cliEnvVars,
    permissions: vals.cliPermissions,
  };
  if (Object.keys(meta).length > 0) {
    base.pattern = `${vals.pattern ?? ""}|${JSON.stringify(meta)}`;
  }
  return base;
}
