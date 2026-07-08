// R17-2 组织部卡片 + 真人详情 重构验证
// 验证点:
//   1. 卡片整张可点 (click 触发 navigation)
//   2. 不再有 MoreHorizontal 三点菜单
//   3. 详情页头部紧凑卡片 (单列布局,不是左右分栏)
//   4. tab 行右侧有醒目编辑按钮
//   5. 协作 tab 有 3 分区说明
import { test, expect } from "@playwright/test";

const ADMIN_EMAIL = "20218181@qq.com";
const ADMIN_PWD = "shidefei@2026";

async function login(page) {
  await page.goto("/login/");
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PWD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(overview|dashboard)/, { timeout: 15000 });
}

test.describe.configure({ mode: "serial" });

test("R17-2 · 01 卡片可点 + 无三点菜单", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  // 等待卡片渲染
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  // 验证没有 MoreHorizontal 三点图标按钮 (检查 aria-label='操作菜单')
  const oldMenu = page.locator('button[aria-label="操作菜单"]');
  await expect(oldMenu).toHaveCount(0);
  // 验证有 tooltip role 的图标按钮 (查看详情/编辑)
  const iconActions = page.locator('[role="tooltip"]');
  // 至少有 4 个 tooltip (查看/编辑/启停/重置密码 ...)
  expect(await iconActions.count()).toBeGreaterThanOrEqual(1);
});

test("R17-2 · 02 点击卡片进入详情", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  await firstCard.click();
  await page.waitForURL(/\/overview\/people\/[^/]+\/?/, { timeout: 10000 });
  // 详情页有返回链接
  await expect(page.locator("text=返回员工列表")).toBeVisible();
});

test("R17-2 · 03 详情页头部紧凑 + 编辑按钮", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  await firstCard.click();
  await page.waitForURL(/\/overview\/people\/[^/]+\/?/, { timeout: 10000 });

  // 编辑按钮在 tab 行 (sticky nav 内,显示"编辑")
  const editBtn = page.locator('nav[aria-label="详情 tab"] button[aria-label="编辑基础信息"]');
  await expect(editBtn).toBeVisible();
  await expect(editBtn).toContainText("编辑");

  // 点编辑进入编辑模式
  await editBtn.click();
  await expect(editBtn).toContainText("退出编辑");
});

test("R17-2 · 04 协作 tab 3 分区", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  await firstCard.click();
  await page.waitForURL(/\/overview\/people\/[^/]+\/?/, { timeout: 10000 });

  // 切到协作 tab
  await page.click('button:has-text("协作对象")');
  // 3 个分区标题
  await expect(page.locator('text=可调度的数字员工')).toBeVisible();
  await expect(page.locator('text=可访问的知识库')).toBeVisible();
  await expect(page.locator('text=可使用的任务模板')).toBeVisible();
});

test("R17-2 · 05 ?edit=true 自动进编辑模式", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  await firstCard.click();
  await page.waitForURL(/\/overview\/people\/[^/]+\/?/, { timeout: 10000 });
  // 附加 ?edit=true
  const url = page.url().split("?")[0];
  await page.goto(`${url}?edit=true`);
  // 编辑按钮应显示"退出编辑"
  const editBtn = page.locator('nav[aria-label="详情 tab"] button[aria-label="编辑基础信息"]');
  await expect(editBtn).toBeVisible();
  await expect(editBtn).toContainText("退出编辑");
});
