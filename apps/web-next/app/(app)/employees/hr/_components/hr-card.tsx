"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AvatarMark } from "../../_components/avatar-mark";
import {
  Briefcase, Sparkles, Copy, Briefcase as DefaultIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDepartmentColor } from "@/lib/department-color";
import { truncate } from "@/lib/text-truncate";

// R57: 6 类岗位类型 ID → 中文标签(用于卡片右上角徽章)
const TEMPLATE_TYPE_LABEL: Record<string, string> = {
  engineering: "工程型",
  painting: "创意型",
  copywriting: "文书型",
  ops: "运营型",
  business: "业务型",
  research: "研究型",
};

// R58: 本地 3 状态映射(删"弃用"标签)
// - 待命(active): 灰色 — 空闲未运行
// - 工作中(草稿 draft 也归到这,因为 D6 设计原本意图是"草稿不显示在生产态 chip" — 现在统一显示为"工作中")
// - 暂停(paused): 橙色 — 暂停
// - 弃用(deprecated) 不再渲染 — 由 hr-library 已过滤(inactive),这里再 fallback 到"待命"
// 注:avatar-mark.tsx 的 statusTone 仍输出 4 态,这里本地覆盖以保持只显示 3 态
type LocalStatus = "待命" | "工作中" | "暂停";
type LocalStatusTone = {
  dot: string;
  label: LocalStatus;
  chip: string;
};
function localStatusTone(status: HrCardData["status"]): LocalStatusTone {
  if (status === "paused") {
    return {
      dot: "bg-orange-500",
      label: "暂停",
      chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    };
  }
  if (status === "draft") {
    return {
      dot: "bg-emerald-500",
      label: "工作中",
      chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    };
  }
  // active / deprecated / 其它 → "待命"
  return {
    dot: "bg-zinc-400",
    label: "待命",
    chip: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  };
}

export interface HrCardData {
  id: string;
  name: string;
  displayName: string;
  persona: string;
  description: string;
  glyph: string;
  hue: string;
  /** R58: 来源保持 4 态(底层 schema),但 chip 只显示 3 态(待命/工作中/暂停) */
  status: "active" | "paused" | "deprecated" | "draft";
  /** 部门名(如 "工程" / "设计" / "HR") — 部门色描边 + 部门徽章用 */
  category: string;
  /** R57: 6 类岗位类型 ID(engineering/painting/copywriting/ops/business/research) */
  templateType: string;
  role: string;
  ironLaws: string[];
  skills: string[];
  tools: string[];
  usageCount: number;
  /** R58: 是否在用 — hr-library 用此过滤 8 tab */
  isActive: boolean;
  /** R58: 来源 — "system"=系统预置(不显示) / "custom"=用户/管理员创建 */
  source: "system" | "custom";
}

/**
 * R53-A1 HR 卡 — 名片样式
 * ----------------------------------------------------------------
 * 形状:圆角 16px(rounded-2xl)+ 1.5:1 横向(aspect-[3/2])+ 细阴影
 * 部门色描边:2px solid 部门色(无底色、避免色彩乱)
 * 文字:岗位介绍 60 字截断
 *
 * 内容:名称 / 类型徽章 / 介绍摘要 / 使用数 / "招聘" 按钮
 */
export function HrCard({ hr }: { hr: HrCardData; index?: number }) {
  // R58: 用本地 3 态 status tone,不用 avatar-mark 的 4 态
  const t = localStatusTone(hr.status);
  const deptColor = getDepartmentColor(hr.category);
  // 介绍摘要(优先 persona、fallback description、60 字截断)
  const summary = truncate(hr.persona || hr.description, 60);
  const deptLabel = hr.category && hr.category.length > 0 ? hr.category : "通用";
  // R55 块3: 只有真实落库岗位(UUID)才能复制;系统预设(tpl-*)不给复制入口。
  const isUuid = /^[0-9a-f-]{36}$/i.test(hr.id);
  return (
    <div
      className={cn(
        // 名片基础:rounded-2xl (16px) + aspect 1.5:1 + 2px 部门色描边 + 细阴影
        "group relative flex aspect-[3/2] flex-col overflow-hidden rounded-2xl bg-card p-5",
        "border-2 shadow-sm",
        "transition-all hover:shadow-md hover:-translate-y-0.5",
      )}
      style={{
        borderColor: deptColor,
        boxShadow: `0 4px 16px -8px ${deptColor}33, 0 1px 3px -1px rgba(0,0,0,0.08)`,
      }}
      data-testid={`hr-card-${hr.id.slice(0, 8)}`}
    >
      {/* 顶行:头像 + 部门 + 类型徽章 + 状态 */}
      <div className="relative flex items-start justify-between gap-3">
        <AvatarMark glyph={hr.glyph} hue={hr.hue} size="sm" />
        <div className="flex flex-col items-end gap-1">
          <span
            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider"
            style={{
              color: deptColor,
              backgroundColor: `${deptColor}1a`, // 10% alpha
            }}
            data-testid={`hr-dept-${hr.id.slice(0, 8)}`}
          >
            <DefaultIcon className="size-2.5" />
            {deptLabel}
          </span>
          {hr.templateType && (
            <span
              className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wider text-foreground/60"
              data-testid={`hr-type-${hr.id.slice(0, 8)}`}
            >
              {TEMPLATE_TYPE_LABEL[hr.templateType] ?? hr.templateType}
            </span>
          )}
          {/* R58: 3 态 status chip(本地的、删了"弃用"label) */}
          <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium", t.chip)}>
            <span className={cn("size-1.5 rounded-full", t.dot)} />
            {t.label}
          </span>
        </div>
      </div>

      {/* 中段:名称 + 介绍摘要(60 字截断) */}
      <div className="relative mt-3 flex flex-1 flex-col gap-1.5 min-h-0">
        <Link href={`/employees/hr/${hr.id}`} className="group/link">
          <h3
            className="text-base font-semibold tracking-tight group-hover/link:underline truncate"
            title={hr.displayName || hr.name}
          >
            {hr.displayName || hr.name || "未命名岗位"}
          </h3>
        </Link>
        <p
          className="text-[12px] leading-relaxed text-foreground/65 line-clamp-3"
          title={hr.persona || hr.description}
          data-testid={`hr-summary-${hr.id.slice(0, 8)}`}
        >
          {summary || <span className="text-foreground/40">暂无描述</span>}
        </p>
      </div>

      {/* 底行:使用数 + 招聘按钮 */}
      <div className="relative mt-auto flex items-center justify-between gap-3 pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-foreground/60">
          <Briefcase className="size-3" />
          <span className="tabular-nums">
            <strong className="font-semibold text-foreground/80">{hr.usageCount}</strong> 在用
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isUuid && (
            <Link href={`/employees/hr/new?mode=clone&hrId=${encodeURIComponent(hr.id)}`}>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-[11px] h-7 px-2.5"
                data-testid={`hr-clone-${hr.id.slice(0, 8)}`}
              >
                <Copy className="size-3" /> 复制
              </Button>
            </Link>
          )}
          <Link href={`/employees/recruit?hrId=${encodeURIComponent(hr.id)}`}>
          <Button
            size="sm"
            className="gap-1 text-[11px] h-7 px-2.5"
            data-testid={`hr-recruit-${hr.id.slice(0, 8)}`}
          >
            <Sparkles className="size-3" /> 招聘
          </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
