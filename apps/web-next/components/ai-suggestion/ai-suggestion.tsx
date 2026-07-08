"use client";

/**
 * AISuggestion — 全站统一的 AI 建议展示组件
 *
 * 4 级 impact 统一色系,暗/亮 mode 自适应:
 *   - high   → rose    (高优先级 / 错误)
 *   - medium → amber   (中优先级 / 警告)
 *   - low    → sky     (低优先级 / 提示)
 *   - info   → violet  (AI 一般建议)
 *
 * 用法:
 *   <AISuggestion impact="high" title="..." suggestion="..." />
 *   <AISuggestionList suggestions={[...]} title="优化建议" />
 */

import * as React from "react";
import {
  Sparkles,
  ArrowRight,
  AlertTriangle,
  Info,
  Lightbulb,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type SuggestionImpact = "high" | "medium" | "low" | "info";

export interface AISuggestionProps {
  impact: SuggestionImpact;
  /** 主标题(必填) — 一句话概括建议对象 / 主题 */
  title: string;
  /** 可选:问题描述(展开说明) */
  problem?: string;
  /** 建议正文(必填) */
  suggestion: string;
  /** 可选:行动按钮 */
  action?: {
    label: string;
    href: string;
  };
  /** 可选:相关指标摘要,如 "错误率 15%" / "延迟 1.2s" */
  metric?: string;
  /** 可选:额外 className */
  className?: string;
}

interface ImpactConfig {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  container: string;
  iconWrap: string;
  iconColor: string;
  labelColor: string;
  actionColor: string;
}

const IMPACT_CONFIG: Record<SuggestionImpact, ImpactConfig> = {
  high: {
    icon: AlertTriangle,
    label: "高优先级",
    container:
      "border-rose-200/70 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30",
    iconWrap: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    labelColor: "text-rose-700 dark:text-rose-300",
    actionColor: "text-rose-700 hover:text-rose-800 dark:text-rose-300 dark:hover:text-rose-200",
  },
  medium: {
    icon: Lightbulb,
    label: "中优先级",
    container:
      "border-amber-200/70 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30",
    iconWrap: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    labelColor: "text-amber-700 dark:text-amber-300",
    actionColor: "text-amber-700 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200",
  },
  low: {
    icon: Info,
    label: "低优先级",
    container:
      "border-sky-200/70 dark:border-sky-900/60 bg-sky-50/70 dark:bg-sky-950/30",
    iconWrap: "bg-sky-100 dark:bg-sky-900/50",
    iconColor: "text-sky-600 dark:text-sky-400",
    labelColor: "text-sky-700 dark:text-sky-300",
    actionColor: "text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200",
  },
  info: {
    icon: Sparkles,
    label: "AI 建议",
    container:
      "border-violet-200/70 dark:border-violet-900/60 bg-violet-50/70 dark:bg-violet-950/30",
    iconWrap: "bg-violet-100 dark:bg-violet-900/50",
    iconColor: "text-violet-600 dark:text-violet-400",
    labelColor: "text-violet-700 dark:text-violet-300",
    actionColor: "text-violet-700 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200",
  },
};

export function AISuggestion({
  impact,
  title,
  problem,
  suggestion,
  action,
  metric,
  className,
}: AISuggestionProps) {
  const cfg = IMPACT_CONFIG[impact];
  const Icon = cfg.icon;
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3.5 transition-colors",
        cfg.container,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "shrink-0 rounded-lg p-2 mt-0.5",
            cfg.iconWrap,
          )}
        >
          <Icon className={cn("size-4", cfg.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={cn(
                "text-[10.5px] font-semibold uppercase tracking-wider",
                cfg.labelColor,
              )}
            >
              {cfg.label}
            </span>
            {metric && (
              <span className="text-[11px] text-muted-foreground font-mono">
                {metric}
              </span>
            )}
          </div>
          <h4 className="text-[13.5px] font-semibold text-foreground leading-snug">
            {title}
          </h4>
          {problem && (
            <p className="mt-1 text-[11.5px] font-mono text-foreground/55 leading-relaxed">
              问题: {problem}
            </p>
          )}
          <p className="mt-1.5 text-[12.5px] text-foreground/85 leading-relaxed">
            {suggestion}
          </p>
          {action && (
            <a
              href={action.href}
              className={cn(
                "mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-medium hover:underline",
                cfg.actionColor,
              )}
            >
              {action.label}
              <ArrowRight className="size-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 容器组件 — 一组建议
// ─────────────────────────────────────────────────────────────

export interface AISuggestionListProps {
  suggestions: AISuggestionProps[];
  /** 标题,默认 "AI 建议" */
  title?: string;
  /** 空状态文案 */
  emptyText?: string;
  /** 是否显示计数后缀 */
  showCount?: boolean;
  className?: string;
}

export function AISuggestionList({
  suggestions,
  title = "AI 建议",
  emptyText = "暂无建议",
  showCount = true,
  className,
}: AISuggestionListProps) {
  const hasIssue = suggestions.some((s) => s.impact !== "info");
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-violet-500" />
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground/85">
            {title}
            {showCount && (
              <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">
                · {suggestions.length} 条
              </span>
            )}
          </h3>
        </div>
        {!hasIssue && suggestions.length > 0 && (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            全部信息级
          </span>
        )}
      </div>
      {suggestions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center">
          <div className="text-[12.5px] text-muted-foreground">{emptyText}</div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {suggestions.map((s, i) => (
            <AISuggestion key={`${s.title}-${i}`} {...s} />
          ))}
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// 适配器 — 把后端不同字段名映射成 AISuggestionProps
// ─────────────────────────────────────────────────────────────

/**
 * diagnosis 后端返回字段 { impact, target, problem, suggestion, action }
 * action 是 href 字符串(可空)。impact 是 "high" | "medium" | "info"
 */
export function fromDiagnosisSuggestion<T extends {
  impact: "high" | "medium" | "info";
  target: string;
  problem?: string;
  suggestion: string;
  action?: string | null;
}>(s: T): AISuggestionProps {
  return {
    impact: s.impact === "info" ? "info" : s.impact === "high" ? "high" : "medium",
    title: s.target,
    problem: s.problem || undefined,
    suggestion: s.suggestion,
    action: s.action ? { label: "去修复", href: s.action } : undefined,
  };
}

/**
 * log fixHint 单条建议,默认 medium 优先级
 */
export function fromLogFixHint(
  fixHint: string,
  opts?: { title?: string; href?: string },
): AISuggestionProps {
  return {
    impact: "medium",
    title: opts?.title ?? "修复建议",
    suggestion: fixHint,
    action: opts?.href ? { label: "查看", href: opts.href } : undefined,
  };
}
