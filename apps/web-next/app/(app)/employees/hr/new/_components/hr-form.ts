// R57 · 新建 HR 岗位向导 — 表单状态 + 6 类岗位类型 + 部门字段。
//
// 岗位 = 静态"配方"(说明书),描述:
//   1) 类型(6 类岗位类型:工程型 / 创意型 / 文书型 / 运营型 / 业务型 / 研究型)
//   2) 部门(19 系统部门 + 用户自建)
//   3) 人格(persona / systemPrompt / ironLaws)—— 唯一核心必填
//   4) 名称
// 动态属性(模型/技能/MCP/记忆/协作/入口)在招聘时由数字员工实例配置,不在这里出现。

export type HrCategoryId =
  | "engineering"
  | "painting"
  | "copywriting"
  | "ops"
  | "business"
  | "research";

export interface HrCategory {
  id: HrCategoryId;
  /** 中文类型名(如 工程型) */
  label: string;
  /** 一句话定义 */
  definition: string;
  /** 适用场景关键词 */
  scenes: string[];
  glyph: string;
}

// R57: 6 类岗位类型 + 明确定义 + 适用场景
// 与后端 chk_template_type CHECK 约束一致(engineering/painting/copywriting/ops/business/research)
export const HR_CATEGORIES: readonly HrCategory[] = [
  {
    id: "engineering",
    label: "工程型",
    definition: "负责开发、测试、运维与系统建设的岗位。",
    scenes: ["研发", "测试", "运维", "架构"],
    glyph: "工",
  },
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
  {
    id: "research",
    label: "研究型",
    definition: "负责调研、分析、学术研究与决策支持的岗位。",
    scenes: ["调研", "分析", "学术", "决策"],
    glyph: "研",
  },
] as const;

export function findCategory(id: string | null | undefined): HrCategory | undefined {
  return HR_CATEGORIES.find((c) => c.id === id);
}

// 向导表单状态 —— 保留岗位蓝图字段 + 部门(R57)。
export interface HrFormState {
  name: string;
  category: HrCategoryId | "";
  departmentId: string;
  persona: string;
  systemPrompt: string;
  ironLaws: string[];
}

export const EMPTY_HR_FORM: HrFormState = {
  name: "",
  category: "",
  departmentId: "",
  persona: "",
  systemPrompt: "",
  ironLaws: [],
};

// 4 步:类型 → 部门 → 人格 → 发布(R57 加部门步)
export const HR_STEPS = [
  { key: "type", label: "类型", hint: "选岗位类型 + 起名字" },
  { key: "department", label: "部门", hint: "把岗位挂到哪个部门" },
  { key: "persona", label: "人格", hint: "定义岗位人格(核心)" },
  { key: "publish", label: "发布", hint: "确认并发布岗位" },
] as const;

export type HrStepKey = (typeof HR_STEPS)[number]["key"];

// 校验:每步是否可进入下一步。
export function canLeaveStep(step: HrStepKey, form: HrFormState): boolean {
  if (step === "type") return form.name.trim().length > 0 && form.category !== "";
  if (step === "department") return form.departmentId.trim().length > 0; // 部门必填
  if (step === "persona") return form.persona.trim().length > 0; // 人格唯一核心必填
  return true;
}
