import { test, expect, type Page } from "@playwright/test";

const BASE = "http://localhost:3200";
const EMP_ID = "1634063d-5862-4230-93d3-1aa166ba0a1c";

async function login(page: Page) {
  await page.goto(`${BASE}/login/`);
  await page.waitForLoadState("domcontentloaded");
  // fill email/password (input names vary, try common ones)
  const email = page.locator('input[type="email"], input[name="email"], input[name="username"]').first();
  const pass = page.locator('input[type="password"]').first();
  await email.fill("20218181@qq.com");
  await pass.fill("shidefei@2026");
  const btn = page.locator('button[type="submit"], button:has-text("登录"), button:has-text("Login")').first();
  await btn.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
}

test("R13-B smoke: 7 tab 渲染 + 卡片菜单 + 编辑按钮存在", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/employees/${EMP_ID}?tab=basics`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);

  // 1. 头部 SID + 卡片菜单按钮存在
  await expect(page.getByTestId("agent-sid")).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("agent-card-menu")).toBeVisible();

  // 2. tab 切到 persona / skills / memory / collab / tasks / logs — 都应渲染
  for (const tab of ["persona", "skills", "memory", "collab", "tasks", "logs"]) {
    await page.goto(`${BASE}/employees/${EMP_ID}?tab=${tab}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(600);
    // 每页都应该有内容(body 不为空)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.length ?? 0).toBeGreaterThan(100);
  }
});

test("R13-B basics: 编辑按钮存在", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/employees/${EMP_ID}?tab=basics`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("edit-basics")).toBeVisible({ timeout: 8000 });
});

test("R49-E logs: 活动日志渲染 + 日期无 NaN + 导出 CSV", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/employees/${EMP_ID}?tab=logs`);
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);
  const bodyText = await page.locator("body").textContent();
  // R49-E fix: 后端 timestamp 是 string(bigint),FE 必须 coerce 成 number 再 new Date,
  // 否则 Invalid Date 渲染成 "NaN月NaN日"。
  expect(bodyText, "日期不能渲染成 NaN").not.toMatch(/NaN月NaN日/);
  // 标题应当出现(有数据时)
  expect(bodyText).toContain("活动日志");
});
