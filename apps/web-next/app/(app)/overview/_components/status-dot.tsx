// 语义化状态点 - 用 oklch 而非鲜艳 hex,带 ring 表达"在线"质感
import { cn } from "@/lib/utils";

type DotStatus = "active" | "paused" | "busy" | "offline" | "error" | "deprecated";

interface Props {
  status: DotStatus;
  label?: string;
  className?: string;
  withLabel?: boolean;
}

const STATUS_COLOR: Record<DotStatus, string> = {
  active: "oklch(0.72 0.16 152)",
  busy: "oklch(0.66 0.15 250)",
  paused: "oklch(0.78 0.16 82)",
  offline: "oklch(0.55 0.01 264)",
  error: "oklch(0.65 0.20 25)",
  deprecated: "oklch(0.55 0.05 290)",
};

const STATUS_LABEL: Record<DotStatus, string> = {
  active: "在岗",
  busy: "管理员",
  paused: "暂停",
  offline: "停用",
  error: "锁定",
  deprecated: "归档",
};

export function StatusDot({ status, label, className, withLabel = false }: Props) {
  const color = STATUS_COLOR[status];
  const text = label ?? STATUS_LABEL[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}>
      <span
        className="relative inline-flex size-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      >
        {status === "active" && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-50"
            style={{ backgroundColor: color }}
          />
        )}
      </span>
      {withLabel && <span className="text-muted-foreground">{text}</span>}
    </span>
  );
}
