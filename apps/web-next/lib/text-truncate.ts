/**
 * R53-A1 文字截断 helper
 * ----------------------------------------------------------------
 * 统一 HR 卡片 / 实例卡 / 任何长文本展示的截断策略。
 * - 中文按 1 字 = 1 字符
 * - max 默认 60,超出 append '...'
 * - 空 / null / undefined 安全返回 ''
 *
 * 用法:truncate("很长的岗位介绍...", 60) → "很长的岗位介绍..."
 */

export function truncate(
  input: string | null | undefined,
  max = 60,
): string {
  if (!input) return "";
  return input.length > max ? input.slice(0, max) + "..." : input;
}