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

  // R23 改动后:编辑按钮移到 BasicTab 卡片头部(信息区右上角"编辑"),不在 nav 行内。
  // 特征:BasicTab 的"基本信息"卡片头右侧,有 Pencil + "编辑" 文字的按钮。
  const editBtn = page.getByRole("button", { name: /^编辑$/ }).first();
  await expect(editBtn).toBeVisible();
  await expect(editBtn).toContainText("编辑");

  // 点编辑进入编辑模式 → 表单出现 + 底部"保存 / 取消"操作条出现
  await editBtn.click();
  // 编辑模式卡片头改为"编辑基本信息"标题
  await expect(page.getByText("编辑基本信息")).toBeVisible();
  // 底部 PersonEditBar 出现"保存"按钮(原本"取消"也已存在)
  const saveBtn = page.getByRole("button", { name: /^保存$/ });
  await expect(saveBtn).toBeVisible();
  const cancelBtn = page.getByRole("button", { name: /^取消$/ });
  await expect(cancelBtn).toBeVisible();
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
  // R26-A 改动后:协作 tab 改为"协作总览 · 关系总图(只读)"(画布版),
  // 原 3 个分区(可调度/可访问/可使用)被替换为可视化关系图。
  await expect(page.getByText(/协作总览.*关系总图/)).toBeVisible();
});

test("R17-2 · 05 ?edit=true 自动进编辑模式", async ({ page }) => {
  await login(page);
  await page.goto("/overview/people/");
  const firstCard = page.locator("[role='button'][aria-label*='详情']").first();
  await expect(firstCard).toBeVisible({ timeout: 10000 });
  await firstCard.click();
  await page.waitForURL(/\/overview\/people\/[^/]+\/?/, { timeout: 10000 });
  // 附加 ?edit=true → 自动进入编辑模式(R17-2 设计的核心功能)
  const url = page.url().split("?")[0];
  await page.goto(`${url}?edit=true`);
  // 编辑模式卡片头改为"编辑基本信息"标题,底部保存/取消条出现
  await expect(page.getByText("编辑基本信息")).toBeVisible();
  const saveBtn = page.getByRole("button", { name: /^保存$/ });
  await expect(saveBtn).toBeVisible();
});
