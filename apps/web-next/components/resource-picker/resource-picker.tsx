"use client";

/**
 * R25 全站通用 ResourcePicker — 增删改查规范里的"选"。
 *
 * 用于:新建向导(选模板/选现有员工)、技能 tab(选 skill / tool / KB)、
 * channels(选 agent)、foundation(选 provider)等所有"从库选+看描述"的场景。
 *
 * 设计:
 * - 顶层 modal(固定 z-50,带遮罩)
 * - 标题 + 搜索 + 列表 + 已选计数 + 取消/确认
 * - 支持 multi(默认)和单选(multi=false)
 * - items 由调用方注入(选择器本身不拉数据,保持纯 UI 组件)
 */

import * as React from "react";
import { Search, Check, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface ResourceItem {
  id: string;
  label: string;
  /** 一句话描述(显示在 label 下方,帮助用户判断) */
  description?: string;
  /** 额外信息(头像/状态/分组等),供自定义渲染时使用 */
  meta?: Record<string, unknown>;
  /**
   * R51-D2: 可选 badge — 用于标注"已绑/未绑"等状态
   *   - text: 文案(如"已绑 · 张三")
   *   - tone: "bound" 绿色(emerald) / "free" 灰色(muted) / "occupied" 琥珀色(amber)
   */
  badge?: { text: string; tone?: "bound" | "free" | "occupied" };
}

export interface ResourcePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  items: ResourceItem[];
  selectedIds: string[];
  onConfirm: (selected: ResourceItem[]) => void;
  loading?: boolean;
  /** 多选(默认 true);单选时点击即替换 */
  multi?: boolean;
  placeholder?: string;
  /** 确认按钮文案(默认"确认") */
  confirmText?: string;
}

export function ResourcePicker({
  open,
  onOpenChange,
  title,
  items,
  selectedIds,
  onConfirm,
  loading,
  multi = true,
  placeholder = "搜索名称或描述…",
  confirmText = "确认",
}: ResourcePickerProps) {
  const [query, setQuery] = React.useState("");
  // 本地 picked 集合 — 打开时从 selectedIds 初始化,关闭/确认后丢弃
  const [picked, setPicked] = React.useState<Set<string>>(new Set(selectedIds));

  React.useEffect(() => {
    if (open) {
      setPicked(new Set(selectedIds));
      setQuery("");
    }
  }, [open, selectedIds]);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.label.toLowerCase().includes(q) ||
        (i.description || "").toLowerCase().includes(q),
    );
  }, [items, query]);

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (!multi) next.clear();
        next.add(id);
      }
      return next;
    });
  };

  // Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  const handleConfirm = () => {
    onConfirm(items.filter((i) => picked.has(i.id)));
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl bg-card ring-1 ring-foreground/10 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 搜索 */}
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              autoFocus
              data-testid="resource-picker-search"
            />
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {loading ? (
            <div className="grid place-items-center py-10">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              {query ? "没找到匹配项" : "暂无可选项"}
            </div>
          ) : (
            filtered.map((item) => {
              const isPicked = picked.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-md mb-1 transition-colors flex items-start gap-2.5 ${
                    isPicked
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "hover:bg-muted/60"
                  }`}
                  data-testid={`resource-picker-item-${item.id}`}
                >
                  <div
                    className={`shrink-0 mt-0.5 size-4 rounded border-2 grid place-items-center transition-colors ${
                      isPicked
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    }`}
                    aria-hidden
                  >
                    {isPicked && <Check className="size-2.5 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{item.label}</span>
                      {item.badge && (
                        <span
                          className={cn(
                            "shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono",
                            item.badge.tone === "bound" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                            item.badge.tone === "occupied" && "bg-amber-500/15 text-amber-700 dark:text-amber-300",
                            (!item.badge.tone || item.badge.tone === "free") && "bg-muted text-muted-foreground",
                          )}
                          data-testid={`resource-picker-badge-${item.badge.tone ?? "free"}-${item.id.slice(0, 8)}`}
                        >
                          {item.badge.text}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {item.description}
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 底部 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
          <span className="text-xs text-muted-foreground font-mono">
            已选 {picked.size} 个{!multi && " · 单选"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              data-testid="resource-picker-cancel"
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirm}
              data-testid="resource-picker-confirm"
            >
              {confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
