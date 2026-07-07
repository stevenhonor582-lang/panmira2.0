import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "err" | "muted" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
  warn: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
  err: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/30",
  muted: "bg-muted text-muted-foreground ring-border",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/30",
};

export function StatusPill({
  tone = "muted",
  label,
  dot = true,
  className,
}: {
  tone?: Tone;
  label: string;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap font-mono",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "ok" && "bg-emerald-500",
            tone === "warn" && "bg-amber-500",
            tone === "err" && "bg-rose-500",
            tone === "muted" && "bg-muted-foreground/60",
            tone === "info" && "bg-sky-500",
          )}
        />
      )}
      {label}
    </span>
  );
}

export function toneForLLMStatus(status: string): Tone {
  switch (status) {
    case "connected":
      return "ok";
    case "expired":
      return "warn";
    case "error":
      return "err";
    case "needs-api-key":
      return "warn";
    default:
      return "muted";
  }
}

export function toneForEndpoint(status: string): Tone {
  switch (status) {
    case "active":
      return "ok";
    case "paused":
      return "muted";
    case "error":
      return "err";
    default:
      return "muted";
  }
}

export function toneForMCP(status: string): Tone {
  switch (status) {
    case "running":
      return "ok";
    case "stopped":
      return "muted";
    case "error":
      return "err";
    default:
      return "muted";
  }
}

export function toneForOAuth(status: string): Tone {
  switch (status) {
    case "active":
      return "ok";
    case "expired":
      return "warn";
    case "revoked":
      return "err";
    case "disabled":
      return "muted";
    default:
      return "muted";
  }
}