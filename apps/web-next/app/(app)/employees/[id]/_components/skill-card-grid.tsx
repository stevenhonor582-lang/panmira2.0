"use client";

/**
 * R31-B: 技能 / 工具块状网格组件
 *
 * 替代 ChipListEditor 的长条罗列,改为标签块状紧凑布局。
 * 每个项一张卡片:
 *   - 原始 ID(代码字体,顶部)
 *   - 中文短描述(粗体)
 *   - 功能说明(灰色,小字)
 *   - 右上角 × 移除按钮(编辑态)
 *
 * 网格排列:sm:grid-cols-2 md:grid-cols-3,紧凑省空间,浏览快。
 * 用于技能列表与额外工具列表(同一组件复用)。
 */

import * as React from "react";
import { X, Plus } from "lucide-react";

export interface CardData {
  /** 项 ID(用于增删) */
  id: string;
  /** 原始 ID 显示(如 superpowers:brainstorming / db_query),可同名 */
  rawId: string;
  /** 中文短描述(粗体行) */
  title: string;
  /** 功能说明(灰色小字) */
  purpose: string;
}

export interface SkillCardGridProps {
  /** 已选项解析出的卡片数据(顺序按 selectedIds 决定) */
  cards: CardData[];
  /** 是否处于编辑态(决定是否显示 × / 添加按钮) */
  editing: boolean;
  /** 移除一项(编辑态回调) */
  onRemove: (id: string) => void;
  /** 添加按钮回调(通常打开 ResourcePicker) */
  onAddClick: () => void;
  /** 添加按钮文案(默认 "+ 添加") */
  addLabel?: string;
  /** 空状态提示(非编辑态) */
  emptyHint?: string;
}

export function SkillCardGrid({
  cards,
  editing,
  onRemove,
  onAddClick,
  addLabel = "添加",
  emptyHint = "尚未配置",
}: SkillCardGridProps) {
  // 空态:编辑态显示"添加"占位卡;非编辑态显示提示
  if (cards.length === 0 && !editing) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-3 text-[12.5px] text-foreground/45">
        {emptyHint}
      </div>
    );
  }

  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.id}
          data-testid={`card-${c.id}`}
          className="relative rounded-lg border border-border bg-card p-2.5 text-[12px] ring-1 ring-border/40 transition hover:ring-foreground/25"
        >
          {/* × 移除按钮 */}
          {editing && (
            <button
              type="button"
              onClick={() => onRemove(c.id)}
              className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded text-foreground/40 hover:bg-destructive/10 hover:text-destructive"
              aria-label={`移除 ${c.rawId}`}
              data-testid={`card-${c.id}-del`}
            >
              <X className="size-3" />
            </button>
          )}

          {/* 原始 ID(代码字体) */}
          <code className="block truncate pr-5 font-mono text-[11.5px] text-foreground/85">
            {c.rawId}
          </code>

          {/* 中文短描述(粗体) */}
          <span className="mt-0.5 block text-[12px] font-medium leading-snug text-foreground">
            {c.title}
          </span>

          {/* 功能说明(灰色小字) */}
          {c.purpose && c.purpose !== c.title && (
            <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-foreground/55">
              {c.purpose}
            </span>
          )}
        </div>
      ))}

      {/* 编辑态:末尾追加"+ 添加"卡片 */}
      {editing && (
        <button
          type="button"
          onClick={onAddClick}
          className="flex min-h-[68px] items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[12px] text-foreground/55 transition hover:border-foreground/40 hover:text-foreground/75"
          data-testid="card-add"
        >
          <Plus className="size-3.5" />
          {addLabel}
        </button>
      )}
    </div>
  );
}
