// R16-3: 定时任务"从已有任务选"modal。
// 用户原话: "制定定时计划直接从已有任务列表选" — 不再跳 /tasks/new 重画 DAG。
"use client";

import * as React from "react";
import { Calendar, Loader2, Search, X } from "lucide-react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PipelineOption {
  id: string;
  name?: string;
  description?: string;
  updatedAt?: string;
}

interface ScheduledJobCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Frequency = "daily" | "weekly" | "monthly" | "custom";

const FREQUENCY_OPTIONS: Array<{ value: Frequency; label: string }> = [
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
  { value: "custom", label: "自定义 Cron" },
];

/** 根据频率 + 时间生成标准 5 段 cron 表达式 (分 时 日 月 周)。 */
function buildCron(freq: Frequency, time: string, weekday: number): string {
  const [h, m] = time.split(":").map((x) => Number(x) || 0);
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  switch (freq) {
    case "daily":
      return `${mm} ${hh} * * *`;
    case "weekly":
      return `${mm} ${hh} * * ${weekday}`;
    case "monthly":
      // 每月 1 号
      return `${mm} ${hh} 1 * *`;
    case "custom":
    default:
      return "";
  }
}

const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

export function ScheduledJobCreateModal({ open, onClose, onCreated }: ScheduledJobCreateModalProps) {
  const [step, setStep] = React.useState<1 | 2 | 3>(1);
  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([]);
  const [loadingPipelines, setLoadingPipelines] = React.useState(false);
  const [pipelineQuery, setPipelineQuery] = React.useState("");
  const [selectedPipelineId, setSelectedPipelineId] = React.useState<string | null>(null);
  const [jobName, setJobName] = React.useState("");
  const [jobDesc, setJobDesc] = React.useState("");
  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [time, setTime] = React.useState("09:00");
  const [weekday, setWeekday] = React.useState(1);
  const [customCron, setCustomCron] = React.useState("0 9 * * *");
  const [notifyOnSuccess, setNotifyOnSuccess] = React.useState(true);
  const [notifyOnFailure, setNotifyOnFailure] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // open 时重置 + 拉取已有 pipelines
  React.useEffect(() => {
    if (!open) return;
    setStep(1);
    setError(null);
    setSelectedPipelineId(null);
    setJobName("");
    setJobDesc("");
    setFrequency("daily");
    setTime("09:00");
    setCustomCron("0 9 * * *");
    setLoadingPipelines(true);
    (async () => {
      try {
        const res = (await api("/api/v2/admin/pipelines")) as {
          data?: { pipelines?: PipelineOption[] } | PipelineOption[];
        };
        const list: PipelineOption[] = Array.isArray(res?.data)
          ? (res?.data as PipelineOption[])
          : ((res?.data as { pipelines?: PipelineOption[] })?.pipelines ?? []);
        setPipelines(list);
      } catch (e) {
        setError(e instanceof Error ? e.message : "加载任务列表失败");
      } finally {
        setLoadingPipelines(false);
      }
    })();
  }, [open]);

  const filteredPipelines = React.useMemo(() => {
    const q = pipelineQuery.trim().toLowerCase();
    if (!q) return pipelines;
    return pipelines.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    );
  }, [pipelines, pipelineQuery]);

  const cronPreview = React.useMemo(() => {
    if (frequency === "custom") return customCron || "—";
    return buildCron(frequency, time, weekday) || "—";
  }, [frequency, time, weekday, customCron]);

  const nextRunPreview = React.useMemo(() => previewNextRun(cronPreview), [cronPreview]);

  const canSubmit =
    !!selectedPipelineId && !!jobName.trim() && (frequency !== "custom" || !!customCron.trim());

  const handleSubmit = React.useCallback(async () => {
    if (!selectedPipelineId || !jobName.trim()) return;
    const cronExpr = frequency === "custom" ? customCron.trim() : buildCron(frequency, time, weekday);
    if (!cronExpr) {
      setError("请填写有效的 cron 表达式");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // 后端字段 agentTemplateId 复用 pipelineId (scheduled-jobs-routes.ts createJob)。
      // inputTemplate 透传通知偏好, 后续执行器读取。
      await api("/api/v2/admin/scheduled-jobs", {
        method: "POST",
        body: {
          agentTemplateId: selectedPipelineId,
          name: jobName.trim(),
          description: jobDesc.trim() || undefined,
          triggerType: "cron",
          cronExpression: cronExpr,
          inputTemplate: {
            notifyOnSuccess,
            notifyOnFailure,
          },
        },
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedPipelineId,
    jobName,
    jobDesc,
    frequency,
    customCron,
    time,
    weekday,
    notifyOnSuccess,
    notifyOnFailure,
    onCreated,
    onClose,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 shadow-xl flex flex-col">
        <header className="flex items-center justify-between px-5 py-3 border-b">
          <div>
            <h2 className="text-base font-semibold">新建定时任务</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              从已有任务选 · 设置执行频率 · 创建调度
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center size-7 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="flex items-center gap-1 px-5 py-2 border-b bg-muted/20 text-[10px]">
          <StepDot n={1} active={step >= 1} label="选择任务" />
          <span className="text-muted-foreground/40 mx-1">·</span>
          <StepDot n={2} active={step >= 2} label="设置计划" />
          <span className="text-muted-foreground/40 mx-1">·</span>
          <StepDot n={3} active={step >= 3} label="通知" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 text-rose-700 px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">从已有任务选择</div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input
                  value={pipelineQuery}
                  onChange={(e) => setPipelineQuery(e.target.value)}
                  placeholder="搜索任务名 / 描述"
                  className="h-9 pl-8 text-sm"
                />
              </div>
              {loadingPipelines ? (
                <div className="grid place-items-center py-8 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin mr-2 inline-block" />
                  加载任务中…
                </div>
              ) : filteredPipelines.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                  没有可选任务。请先到「任务列表」创建一个 DAG 任务。
                </div>
              ) : (
                <div className="space-y-1 max-h-[320px] overflow-y-auto">
                  {filteredPipelines.map((p) => {
                    const selected = selectedPipelineId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedPipelineId(p.id);
                          if (!jobName.trim()) setJobName((p.name ?? "") + " · 定时");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md ring-1 transition-all",
                          selected
                            ? "bg-primary/5 ring-primary/40"
                            : "ring-foreground/10 hover:bg-muted/50",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "grid place-items-center size-4 rounded-full ring-1",
                              selected ? "bg-primary ring-primary" : "ring-foreground/30",
                            )}
                          >
                            {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {p.name ?? "未命名任务"}
                            </div>
                            {p.description && (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {p.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">任务名称</label>
                <Input
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="例如 · 客户跟进 · 每天 9 点"
                  className="h-9 text-sm"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">描述 (可选)</label>
                <textarea
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="这次调度的用途"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">执行频率</label>
                <div className="flex flex-wrap gap-1.5">
                  {FREQUENCY_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setFrequency(o.value)}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs ring-1 transition-all",
                        frequency === o.value
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-card ring-foreground/15 hover:bg-muted",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              {frequency !== "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium">执行时间</label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </div>
                  {frequency === "weekly" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium">星期</label>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setWeekday(d)}
                            className={cn(
                              "grid place-items-center size-8 rounded text-xs ring-1",
                              weekday === d
                                ? "bg-primary text-primary-foreground ring-primary"
                                : "ring-foreground/15 hover:bg-muted",
                            )}
                          >
                            {WEEKDAY_LABEL[d]}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {frequency === "custom" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Cron 表达式 (分 时 日 月 周)</label>
                  <Input
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    placeholder="0 9 * * *"
                    className="h-9 text-sm font-mono"
                  />
                  <div className="text-[10px] text-muted-foreground">
                    例: <code className="font-mono">0 9 * * *</code> 每天 9 点 ·{" "}
                    <code className="font-mono">*/30 * * * *</code> 每 30 分钟 ·{" "}
                    <code className="font-mono">0 9 * * 1</code> 每周一
                  </div>
                </div>
              )}
              <div className="rounded-md ring-1 ring-foreground/10 bg-muted/30 px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Cron 预览</span>
                  <code className="font-mono">{cronPreview}</code>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-muted-foreground">下次执行 (预览)</span>
                  <span className="font-mono">{nextRunPreview}</span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm font-medium">通知配置</div>
              <label className="flex items-start gap-2 px-3 py-2 rounded-md ring-1 ring-foreground/10 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={notifyOnSuccess}
                  onChange={(e) => setNotifyOnSuccess(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">执行成功时通知</div>
                  <div className="text-[11px] text-muted-foreground">
                    任务跑完无异常时,向负责人发送飞书/邮件通知。
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 px-3 py-2 rounded-md ring-1 ring-foreground/10 cursor-pointer hover:bg-muted/30">
                <input
                  type="checkbox"
                  checked={notifyOnFailure}
                  onChange={(e) => setNotifyOnFailure(e.target.checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">执行失败时通知</div>
                  <div className="text-[11px] text-muted-foreground">
                    任务异常 / 超时 / 节点失败时,立即通知负责人。
                  </div>
                </div>
              </label>
              <div className="rounded-md bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                通知接收人:任务的负责人 (owner)。可在任务详情页修改。
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between px-5 py-3 border-t bg-muted/10">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (step === 1) onClose();
              else setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
            }}
            disabled={submitting}
          >
            {step === 1 ? "取消" : "上一步"}
          </Button>
          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button
                size="sm"
                onClick={() => setStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
                disabled={step === 1 && !selectedPipelineId}
              >
                下一步
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || submitting}>
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Calendar className="size-3.5" />}
                创建定时任务
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function StepDot({ n, active, label }: { n: number; active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "grid place-items-center size-4 rounded-full text-[9px] font-semibold",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {n}
      </span>
      <span className={cn("text-[10px]", active ? "text-foreground font-medium" : "text-muted-foreground")}>
        {label}
      </span>
    </div>
  );
}

/** 简单预览下一次执行时间 — 仅用于 UI 提示,实际由后端 cron 引擎计算。 */
function previewNextRun(cron: string): string {
  // 极简实现: 支持 "M H * * *" (每天), "M H * * W" (每周 W), "M H D * *" (每月 D)
  try {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return "—";
    const m = parseInt(parts[0]!, 10);
    const h = parseInt(parts[1]!, 10);
    const now = new Date();
    const next = new Date(now);
    next.setSeconds(0, 0);
    next.setHours(h, m, 0);
    if (parts[2] === "*" && parts[3] === "*" && parts[4] === "*") {
      if (next <= now) next.setDate(next.getDate() + 1);
    } else if (parts[4] !== "*") {
      const w = parseInt(parts[4]!, 10);
      const cur = now.getDay();
      let diff = (w - cur + 7) % 7;
      if (diff === 0 && next <= now) diff = 7;
      next.setDate(now.getDate() + diff);
    } else if (parts[2] !== "*") {
      const d = parseInt(parts[2]!, 10);
      next.setDate(d);
      if (next <= now) next.setMonth(next.getMonth() + 1);
    } else {
      return "—";
    }
    return next.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
