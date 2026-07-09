import { test, expect } from "@playwright/test";

// R20: AI assistant button renders on the canvas toolbar and opens the modal.
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

  // Clicking it opens the modal with the heading
  await aiBtn.click();
  await expect(page.getByText("AI 任务编排助手")).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/示例/)).toBeVisible();

  // An example chip should fill the textarea
  const example = page.getByRole("button", { name: /客户在飞书咨询产品/ });
  await expect(example).toBeVisible();
  await example.click();
  await expect(page.locator("textarea#task-desc")).toBeEmpty();
  await expect(page.getByRole("textbox", { name: /例如:客户咨询/ })).not.toBeEmpty();

  // Cancel closes the modal
  await page.locator(".fixed.inset-0").getByRole("button", { name: "取消" }).click();
  await expect(page.getByText("AI 任务编排助手")).toBeHidden({ timeout: 5000 });
});
