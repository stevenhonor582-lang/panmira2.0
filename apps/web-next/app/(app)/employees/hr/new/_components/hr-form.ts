// R55 块3 · 新建 HR 岗位向导 — 表单状态 + 岗位类型常量。
// 完全独立于数字员工向导(app/(app)/employees/new/_components/*),不复用其组件/类型。
//
// 岗位 = 静态"配方"(说明书),只描述 3 件事:
//   1) 类型(painting/copywriting/ops/business)
//   2) 人格(persona / systemPrompt / ironLaws)—— 唯一核心必填
//   3) 名称
// 动态属性(模型/技能/MCP/记忆/协作/入口)在招聘时由数字员工实例配置,不在这里出现。

export type HrCategoryId = "painting" | "copywriting" | "ops" | "business";

export interface HrCategory {
  id: HrCategoryId;
  /** 中文类型名(如 创意型) */
  label: string;
  /** 一句话定义 */
  definition: string;
  /** 适用场景关键词 */
  scenes: string[];
  glyph: string;
}

// 3.3 标准 4 类岗位 + 明确定义 + 适用场景
export const HR_CATEGORIES: readonly HrCategory[] = [
  {
    id: "painting",
    label: "创意型",
    definition: "负责设计、视觉与原创产出的岗位。",
    scenes: ["设计", "视觉", "创作"],
    glyph: "创",
  },
  {
    id: "copywriting",
    label: "文书型",
    definition: "负责写作、内容、翻译与文档的岗位。",
    scenes: ["写作", "内容", "翻译", "文档"],
    glyph: "文",
  },
  {
    id: "ops",
    label: "运营型",
    definition: "负责维护、监控、部署与故障处理的岗位。",
    scenes: ["维护", "监控", "部署", "故障"],
    glyph: "运",
  },
  {
    id: "business",
    label: "业务型",
    definition: "负责销售、客户、运营、财务与通用事务的岗位。",
    scenes: ["销售", "客户", "运营", "财务", "通用"],
    glyph: "业",
  },
] as const;

export function findCategory(id: string | null | undefined): HrCategory | undefined {
  return HR_CATEGORIES.find((c) => c.id === id);
}

// 向导表单状态 —— 只保留岗位蓝图字段。
export interface HrFormState {
  name: string;
  category: HrCategoryId | "";
  persona: string;
  systemPrompt: string;
  ironLaws: string[];
}

export const EMPTY_HR_FORM: HrFormState = {
  name: "",
  category: "",
  persona: "",
  systemPrompt: "",
  ironLaws: [],
};

// 3 步:类型 → 人格 → 发布
export const HR_STEPS = [
  { key: "type", label: "类型", hint: "选岗位类型 + 起名字" },
  { key: "persona", label: "人格", hint: "定义岗位人格(核心)" },
  { key: "publish", label: "发布", hint: "确认并发布岗位" },
] as const;

export type HrStepKey = (typeof HR_STEPS)[number]["key"];

// 校验:每步是否可进入下一步。
export function canLeaveStep(step: HrStepKey, form: HrFormState): boolean {
  if (step === "type") return form.name.trim().length > 0 && form.category !== "";
  if (step === "persona") return form.persona.trim().length > 0; // 人格唯一核心必填
  return true;
}
