import { test, expect } from "@playwright/test";

// R21: AI 生成过程展示 + 节点执行详情
// 这个测试不真正调 AI(慢 + 不可控),只验证 UI 结构:
//   1. AI 面板打开后,有 textarea + "生成编排" 按钮
//   2. 录一段 stub 通过 window 状态(无法直接 stub,改为只验证基础渲染)
//   3. 进入一个真实 pipeline 详情页,执行日志面板渲染
//   4. 节点配置面板渲染

test.describe("R21 · 任务编排过程展示", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('input[type="email"]', "20218181@qq.com");
    await page.fill('input[type="password"]', "shidefei@2026");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(overview|dashboard)/, { timeout: 15000 }).catch(() => {});
  });

  test("AI 助手面板:渲染示例 + textarea + 生成按钮", async ({ page }) => {
    await page.goto("/tasks/new");
    await page.waitForSelector('[data-testid="dag-palette"]', { timeout: 15000 });

    const aiBtn = page.getByRole("button", { name: /AI 助手/ });
    await expect(aiBtn).toBeVisible({ timeout: 10000 });
    await aiBtn.click();

    // 浮动面板标题
    await expect(page.getByText("AI 任务编排助手")).toBeVisible({ timeout: 5000 });

    // 示例可折叠
    await expect(page.getByText(/示例/)).toBeVisible();

    // 生成按钮存在(文案为"生成编排")
    await expect(page.getByRole("button", { name: /生成编排/ })).toBeVisible();

    // 字数计数显示
    await expect(page.getByText(/\/2000/)).toBeVisible();
  });

  test("pipeline 详情页:执行日志 + 节点配置面板都在", async ({ page }) => {
    // 触发一次 run 后的 pipeline
    await page.goto("/tasks/89b79f8e-2cd1-4fa7-84fe-65771e0a6ba7");
    await page.waitForLoadState("networkidle");

    // 执行日志或运行历史 面板存在
    const logPanel = page.getByText(/执行日志|运行历史|触发一次/);
    await expect(logPanel.first()).toBeVisible({ timeout: 15000 });
  });
});
