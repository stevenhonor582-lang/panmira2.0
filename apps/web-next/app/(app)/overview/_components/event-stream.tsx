// 事件流 - 真实 time-aware list
// 渲染最近 N 条 activity events,带"在线"小红点 pulse
import { CircleDot, MessageSquare, Sparkles } from "lucide-react";
import type { ActivityEvent } from "./data";
import { cn } from "@/lib/utils";

interface Props {
  events: ActivityEvent[];
  className?: string;
}

function formatTime(input?: string): string {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const TYPE_LABEL: Record<string, { label: string; icon: typeof MessageSquare }> = {
  task_completed: { label: "任务完成", icon: CircleDot },
  task_started: { label: "任务开始", icon: CircleDot },
  decision: { label: "决策", icon: Sparkles },
  message: { label: "消息", icon: MessageSquare },
};

export function EventStream({ events, className }: Props) {
  if (!events.length) {
    return (
      <div className={cn("rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground", className)}>
        最近没有活动事件 — 数字员工和员工产生交互后会显示在这里
      </div>
    );
  }

  return (
    <ol className={cn("divide-y divide-border rounded-xl border border-border bg-card overflow-hidden", className)}>
      {events.map((e, idx) => {
        const meta = TYPE_LABEL[e.type] ?? { label: e.type, icon: CircleDot };
        const Icon = meta.icon;
        return (
          <li key={e.id ?? idx} className="flex items-start gap-3 p-3.5 hover:bg-muted/40 transition-colors">
            <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-xs font-medium text-foreground">{meta.label}</span>
                {e.botName && (
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    @{e.botName}
                  </span>
                )}
                <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
                  {formatTime(e.createdAt)}
                </span>
              </div>
              {e.prompt && (
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  <span className="text-foreground/70">问:</span> {e.prompt}
                </p>
              )}
              {e.responsePreview && (
                <p className="mt-0.5 text-xs text-foreground/80 line-clamp-2">
                  {e.responsePreview}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
