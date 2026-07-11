"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AvatarMark, statusTone } from "../../_components/avatar-mark";
import {
  Briefcase, Sparkles, Briefcase as DefaultIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getDepartmentColor } from "@/lib/department-color";
import { truncate } from "@/lib/text-truncate";

export interface HrCardData {
  id: string;
  name: string;
  displayName: string;
  persona: string;
  description: string;
  glyph: string;
  hue: string;
  status: "active" | "paused" | "deprecated" | "draft";
  category: string;
  role: string;
  ironLaws: string[];
  skills: string[];
  tools: string[];
  usageCount: number;
}

/**
 * R53-A1 HR 卡 — 名片样式
 * ----------------------------------------------------------------
 * 形状:圆角 16px(rounded-2xl)+ 1.5:1 横向(aspect-[3/2])+ 细阴影
 * 部门色描边:2px solid 部门色(无底色,避免色彩乱)
 * 文字:岗位介绍 60 字截断
 *
 * 内容:名称 / 类型徽章 / 介绍摘要 / 使用数 / "招聘" 按钮
 */
export function HrCard({ hr }: { hr: HrCardData; index?: number }) {
  const t = statusTone(hr.status);
  const deptColor = getDepartmentColor(hr.category);
  // 介绍摘要(优先 persona,fallback description,60 字截断)
  const summary = truncate(hr.persona || hr.description, 60);
  const deptLabel = hr.category && hr.category.length > 0 ? hr.category : "通用";
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
      {/* 顶行:头像 + 部门 + 状态 */}
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
  );
}