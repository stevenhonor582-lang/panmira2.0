import { test, expect } from "@playwright/test";

// R20: AI assistant button renders on the canvas toolbar and opens the modal.
// 2026-07-11 R50-2: AI 助手 dialog 改为浮动面板(不遮罩),示例折叠在 <details> 里,关闭按钮文案改"关闭"。
test("R20: AI 助手 button opens modal on /tasks/new", async ({ page }) => {
  // Login as admin
  await page.goto("/login");
  await page.fill('input[type="email"]', "20218181@qq.com");
  await page.fill('input[type="password"]', "shidefei@2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(overview|dashboard)/, { timeout: 15000 }).catch(() => {});

  await page.goto("/tasks/new");
  await page.waitForSelector('[data-testid="dag-palette"]', { timeout: 15000 });

  // The AI 助手 button should be visible
  const aiBtn = page.getByRole("button", { name: /AI 助手/ });
  await expect(aiBtn).toBeVisible({ timeout: 10000 });

  // Clicking it opens the floating panel with the heading
  await aiBtn.click();
  await expect(page.getByText("AI 任务编排助手")).toBeVisible({ timeout: 5000 });

  // Examples are collapsed by default — expand the <details> summary first
  await page.locator("summary", { hasText: /示例/ }).click();
  // Now an example chip containing "客户在飞书咨询产品" should be visible
  const example = page.getByRole("button", { name: /客户在飞书咨询产品/ });
  await expect(example).toBeVisible({ timeout: 5000 });
  await example.click();
  // 浮动面板里的 textarea(无固定 id #task-desc,改为按 placeholder 定位)
  const textarea = page.locator('textarea[placeholder*="客户咨询飞书"]');
  await expect(textarea).not.toBeEmpty();

  // 关闭按钮(原"取消"已改为"关闭",且不再有 .fixed.inset-0 遮罩)
  const closeBtn = page.getByRole("button", { name: "关闭" }).first();
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(page.getByText("AI 任务编排助手")).toBeHidden({ timeout: 5000 });
});
