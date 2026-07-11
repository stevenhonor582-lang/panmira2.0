/**
 * R53-A1 部门色映射 (19 部门) — D2 决策
 * ----------------------------------------------------------------
 * 部门 → 主色(描边 + icon 用),无底色(避免色彩乱)。
 * 颜色选择:同色系邻近色,饱和度统一,符合现代名片风格。
 *
 * 用法:DEPARTMENT_COLOR['HR'] → '#a855f7'(紫色)
 *      getDepartmentColor(category) → '#a855f7' | 默认灰(未匹配)
 */

export const DEPARTMENT_COLOR: Record<string, string> = {
  // 19 部门 (D2 决策,严禁修改)
  "工程":     "#2563eb", // 蓝
  "设计":     "#ec4899", // 粉
  "营销":     "#f97316", // 橙
  "销售":     "#eab308", // 金
  "财务":     "#22c55e", // 绿
  "HR":       "#a855f7", // 紫
  "法务":     "#6366f1", // 靛
  "供应链":   "#a16207", // 棕
  "产品":     "#06b6d4", // 青
  "测试":     "#64748b", // 蓝灰
  "支持":     "#0d9488", // 蓝绿
  "专项":     "#6b7280", // 灰
  "空间计算": "#be185d", // 紫红
  "游戏开发": "#991b1b", // 暗红
  "学术":     "#1e3a8a", // 深蓝
  "GIS":      "#0891b2", // 蓝绿
  "安全":     "#dc2626", // 红
  "通用":     "#9ca3af", // 灰
  "其它":     "#9ca3af", // 中性灰
};

/** 默认兜底色(任何 category 不命中时使用) */
export const DEFAULT_DEPARTMENT_COLOR = "#9ca3af";

/**
 * 取部门色;category 为空 / 不在表内 → 默认灰
 * 兼容 null / undefined / 非字符串输入
 */
export function getDepartmentColor(category: unknown): string {
  if (typeof category !== "string" || category.length === 0) {
    return DEFAULT_DEPARTMENT_COLOR;
  }
  return DEPARTMENT_COLOR[category] ?? DEFAULT_DEPARTMENT_COLOR;
}