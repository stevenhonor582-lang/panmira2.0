import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

const BASE = "http://localhost:3200";

const ADMIN_TOKEN_RAW = fs.existsSync("/tmp/admin_token.txt")
  ? fs.readFileSync("/tmp/admin_token.txt", "utf8")
  : "";
const ADMIN_TOKEN = ADMIN_TOKEN_RAW.replace("TOKEN=", "").trim();
const ADMIN_USER = {
  id: "9b55c08d-8591-421d-ba4b-694d30787fd3",
  email: "20218181@qq.com",
  name: "史德飞",
  role: "admin",
  tenantId: "491c000f-7e34-4a6e-a561-d8a948c6e429",
};

async function loginAdmin(page: Page) {
  await page.addInitScript(
    ({ token, user }) => {
      if (token) {
        localStorage.setItem("panmira.token", token);
        localStorage.setItem("panmira.refresh", "mock-refresh");
      }
      localStorage.setItem("panmira.user", JSON.stringify(user));
    },
    { token: ADMIN_TOKEN, user: ADMIN_USER },
  );
}

test.describe.configure({ mode: "serial" });

test("R17-1 sidebar 删除冗余子项", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`${BASE}/employees`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const sidebarText = await page.locator("aside").innerText({ timeout: 10000 });

  expect(sidebarText).not.toContain("新建向导");
  expect(sidebarText).not.toContain("员工详情");
  // R32-A 改动后:员工库拆为「智能体员工 / 数字员工」两区,保留"数字员工"作为锚点。
  expect(sidebarText).toContain("数字员工");

  expect(sidebarText).not.toContain("短期记忆");
  expect(sidebarText).not.toContain("长期记忆");
  expect(sidebarText).not.toContain("永久记忆");
  expect(sidebarText).toContain("记忆");
  expect(sidebarText).toContain("知识库");
  expect(sidebarText).toContain("抽取");
  expect(sidebarText).toContain("反馈");

  expect(sidebarText).not.toContain("新建任务");
  expect(sidebarText).toContain("任务列表");
  expect(sidebarText).toContain("定时任务");
});

test("R17-1 topbar 版本号 PAMELA 2.4", async ({ page }) => {
  await loginAdmin(page);
  await page.goto(`${BASE}/employees`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  const sidebarText = await page.locator("aside").innerText({ timeout: 10000 });
  expect(sidebarText).toContain("2.4");
  expect(sidebarText).not.toContain("IA v6");
  expect(sidebarText).not.toContain("Admin Console");

  await page.screenshot({
    path: "/home/ubuntu/panmira-N1/.claude/r17-1-sidebar-2.4.png",
    fullPage: false,
  });
});

test("R17-1 头像个人资料跳转 /overview/people/<id>", async ({ page }) => {
  await loginAdmin(page);
  // 用 /employees(已知稳定)避免 /overview/dashboard SSR 偶发 "This page couldn't load"。
  await page.goto(`${BASE}/employees`);
  await page.waitForLoadState("networkidle");
  await page.locator("aside").waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);

  // 确认头像 trigger 渲染(右上角 header 内含用户名的 button)
  const trigger = page
    .locator("header button")
    .filter({ hasText: /史德飞|未登录/ })
    .first();
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.click();

  // 等下拉弹出
  const profileItem = page.locator('[role="menuitem"]:has-text("个人资料")');
  await profileItem.waitFor({ state: "visible", timeout: 5000 });
  await profileItem.click();

  await page.waitForURL(/\/overview\/people/, { timeout: 10000 });
  await page.waitForLoadState("networkidle");
  const url = page.url();
  console.log(`[R17-1] profile navigated to: ${url}`);
  expect(url).toContain("/overview/people");
  expect(url).toContain(ADMIN_USER.id);

  await page.screenshot({
    path: "/home/ubuntu/panmira-N1/.claude/r17-1-profile-landed.png",
    fullPage: false,
  });
});
