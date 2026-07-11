"use client";

import * as React from "react";
import { findCategory, type HrFormState } from "./hr-form";

/**
 * R55 块3 · Step 3 发布(确认)
 * ----------------------------------------------------------------
 * 只读汇总岗位蓝图:名称 / 类型 / 人格 / 系统提示词 / 铁律。
 * 底部单一"发布"按钮由 wizard 统一渲染,这里不放任何按钮。
 */
export function StepPublish({ form }: { form: HrFormState }) {
  const cat = findCategory(form.category);
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-foreground/55">
        确认岗位说明书。发布后可在岗位库里被"招聘"成数字员工 —— 招聘时再配置模型 / 技能 / 入口等动态属性。
      </p>

      <dl className="divide-y divide-border rounded-2xl border border-border">
        <Row label="岗位名称" value={form.name || "—"} testid="review-name" />
        <Row label="岗位类型" value={cat ? `${cat.label} · ${cat.definition}` : "—"} testid="review-category" />
        <Row label="岗位人格" value={form.persona || "—"} testid="review-persona" multiline />
        <Row label="系统提示词" value={form.systemPrompt || "(留空,由人格派生)"} testid="review-system" multiline />
        <Row
          label="铁律"
          value={form.ironLaws.length ? form.ironLaws.map((l, i) => `${i + 1}. ${l}`).join("\n") : "(无)"}
          testid="review-laws"
          multiline
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  testid,
  multiline,
}: {
  label: string;
  value: string;
  testid: string;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-4 px-5 py-3.5">
      <dt className="text-[12.5px] font-medium text-foreground/50">{label}</dt>
      <dd
        data-testid={testid}
        className={
          "text-[13.5px] text-foreground/85 " + (multiline ? "whitespace-pre-wrap leading-relaxed" : "truncate")
        }
      >
        {value}
      </dd>
    </div>
  );
}
