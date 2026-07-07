"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
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
import { Loader2, Clock, Webhook, Zap, AlertTriangle, HelpCircle } from "lucide-react";
import { api } from "@/lib/api";

export type TriggerType = "cron" | "event" | "manual";

export interface ScheduledJob {
  id: string;
  name: string;
  description: string | null;
  triggerType: TriggerType;
  cronExpression: string | null;
  eventTopic: string | null;
  enabled: boolean;
  inputTemplate?: Record<string, unknown>;
  agentTemplateId: string;
}

export interface JobFormValues {
  name: string;
  description: string;
  triggerType: TriggerType;
  cronExpression: string;
  eventTopic: string;
  agentTemplateId: string;
  initialInput: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: ScheduledJob | null;
  onSubmit: (values: JobFormValues) => Promise<void>;
}

interface Agent {
  id: string;
  name: string;
  displayName: string;
  roleTemplate: string;
  isActive: boolean;
}

const TRIGGER_META: Record<TriggerType, { label: string; icon: typeof Clock; hint: string }> = {
  cron: { label: "定时任务", icon: Clock, hint: "按 cron 表达式定时触发 (例: 每天 23:00)" },
  event: { label: "事件触发", icon: Webhook, hint: "订阅业务事件触发 (例: order.created)" },
  manual: { label: "手动触发", icon: Zap, hint: "仅靠用户手动触发 / API 调用" },
};

const CRON_PRESETS: { label: string; expr: string }[] = [
  { label: "每分钟", expr: "* * * * *" },
  { label: "每小时", expr: "0 * * * *" },
  { label: "每天 23:00", expr: "0 23 * * *" },
  { label: "每周一 9:00", expr: "0 9 * * 1" },
  { label: "每月 1 号 0:00", expr: "0 0 1 * *" },
];

export function JobDialog({ open, onOpenChange, initial, onSubmit }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("cron");
  const [cronExpression, setCronExpression] = useState("0 23 * * *");
  const [eventTopic, setEventTopic] = useState("");
  const [agentTemplateId, setAgentTemplateId] = useState("");
  const [initialInput, setInitialInput] = useState("{}");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAgentsLoading(true);
    api<{ agents?: Agent[] }>("/api/v2/admin/agents")
      .then((r) => setAgents(r.agents ?? []))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [open]);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setTriggerType(initial?.triggerType ?? "cron");
      setCronExpression(initial?.cronExpression ?? "0 23 * * *");
      setEventTopic(initial?.eventTopic ?? "");
      setAgentTemplateId(initial?.agentTemplateId ?? "");
      setInitialInput(JSON.stringify(initial?.inputTemplate ?? {}, null, 2));
      setError(null);
    }
  }, [open, initial]);

  const isEdit = !!initial;

  const nextRunPreview = useMemo(() => {
    if (triggerType !== "cron" || !cronExpression) return null;
    try {
      const parts = cronExpression.trim().split(/\s+/);
      if (parts.length !== 5) return null;
      const [m, h, dom, mon, dow] = parts;
      void dow;
      const now = new Date();
      const next = new Date(now);
      next.setSeconds(0, 0);
      const applyHour = () => {
        if (h === "*") return false;
        const n = parseInt(h, 10);
        if (Number.isFinite(n)) next.setHours(n);
        return true;
      };
      const applyMinute = () => {
        if (m === "*") return false;
        const n = parseInt(m, 10);
        if (Number.isFinite(n)) next.setMinutes(n);
        return true;
      };
      const applyDom = () => {
        if (dom === "*") return false;
        const n = parseInt(dom, 10);
        if (Number.isFinite(n)) next.setDate(n);
        return true;
      };
      const applyMon = () => {
        if (mon === "*") return false;
        const n = parseInt(mon, 10);
        if (Number.isFinite(n)) next.setMonth(n - 1);
        return true;
      };
      applyMon();
      applyDom();
      applyHour();
      applyMinute();
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next.toLocaleString("zh-CN");
    } catch {
      return null;
    }
  }, [cronExpression, triggerType]);

  const reset = () => {
    setName(""); setDescription(""); setTriggerType("cron");
    setCronExpression("0 23 * * *"); setEventTopic("");
    setAgentTemplateId(""); setInitialInput("{}"); setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let inputParsed: Record<string, unknown> = {};
    try {
      inputParsed = JSON.parse(initialInput) as Record<string, unknown>;
    } catch {
      setError("初始输入 JSON 格式错误");
      return;
    }
    if (!agentTemplateId) {
      setError("请选择 Agent");
      return;
    }
    if (triggerType === "cron" && !cronExpression.trim()) {
      setError("cron 触发需要表达式");
      return;
    }
    if (triggerType === "event" && !eventTopic.trim()) {
      setError("事件触发需要 topic");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        triggerType,
        cronExpression: triggerType === "cron" ? cronExpression.trim() : "",
        eventTopic: triggerType === "event" ? eventTopic.trim() : "",
        agentTemplateId,
        initialInput: JSON.stringify(inputParsed),
      });
      onOpenChange(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑定时任务" : "新建定时任务"}</DialogTitle>
          <DialogDescription>
            把一个 Agent 模板配成定时 / 事件 / 手动触发,让它自动跑业务逻辑
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="text-xs font-medium text-muted-foreground px-1">基础信息</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="job-name">任务名称 *</Label>
                <Input
                  id="job-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="如:每日销售日报"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="job-agent">执行 Agent *</Label>
                <select
                  id="job-agent"
                  value={agentTemplateId}
                  onChange={(e) => setAgentTemplateId(e.target.value)}
                  required
                  disabled={agentsLoading}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{agentsLoading ? "加载中…" : "选择 Agent"}</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.displayName || a.name} ({a.roleTemplate})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="job-desc">描述</Label>
              <Input
                id="job-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="一句话说明这个 Job 做什么"
              />
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="text-xs font-medium text-muted-foreground px-1">触发方式</legend>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(TRIGGER_META) as TriggerType[]).map((t) => {
                const m = TRIGGER_META[t];
                const Icon = m.icon;
                const active = triggerType === t;
                return (
                  <button
                    type="button"
                    key={t}
                    onClick={() => setTriggerType(t)}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <Icon className={`size-4 mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{m.label}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">{m.hint}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {triggerType === "cron" && (
              <div className="space-y-2">
                <Label htmlFor="job-cron" className="flex items-center gap-1">
                  Cron 表达式 *
                  <a
                    href="https://crontab.guru/"
                    target="_blank"
                    rel="noreferrer"
                    className="text-muted-foreground hover:text-primary"
                    title="cron 语法参考"
                  >
                    <HelpCircle className="size-3" />
                  </a>
                </Label>
                <Input
                  id="job-cron"
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 23 * * *"
                  required
                  className="font-mono"
                />
                <div className="flex flex-wrap gap-1">
                  {CRON_PRESETS.map((p) => (
                    <button
                      type="button"
                      key={p.expr}
                      onClick={() => setCronExpression(p.expr)}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted/30 hover:bg-muted font-mono"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {nextRunPreview && (
                  <p className="text-[11px] text-muted-foreground">
                    下次预计执行: <span className="font-mono text-foreground">{nextRunPreview}</span>
                  </p>
                )}
              </div>
            )}

            {triggerType === "event" && (
              <div className="space-y-1.5">
                <Label htmlFor="job-event">事件 Topic *</Label>
                <Input
                  id="job-event"
                  value={eventTopic}
                  onChange={(e) => setEventTopic(e.target.value)}
                  placeholder="如:order.created / invoice.paid"
                  required
                  className="font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  订阅这个 topic,事件触发时自动跑 Agent。event payload 通过下方"初始输入"模板提取字段
                </p>
              </div>
            )}

            {triggerType === "manual" && (
              <div className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                仅靠用户手动触发 / API 调用,不自动运行
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2 rounded-md border border-border p-3">
            <legend className="text-xs font-medium text-muted-foreground px-1">初始输入 (JSON)</legend>
            <textarea
              rows={5}
              value={initialInput}
              onChange={(e) => setInitialInput(e.target.value)}
              placeholder='{"input": "今天销售数据", "extra": {...}}'
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground">
              事件触发时,可在此写 JSONPath / 模板变量从 event payload 提取
            </p>
          </fieldset>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive flex items-center gap-2">
              <AlertTriangle className="size-3" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}
              {isEdit ? "保存修改" : "创建 Job"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
