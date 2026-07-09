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

// R30-B: 移动端 sidebar 抽屉 (375px viewport,模仿 iPhone X)
test.describe("R30-B 移动端 sidebar 抽屉", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("hamburger 触发抽屉 + backdrop 关闭", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // 1) hamburger 按钮可见(< md 显示),aria-label "打开导航菜单"
    const hamburger = page.getByRole("button", { name: "打开导航菜单" });
    await expect(hamburger).toBeVisible();

    // 2) 抽屉关闭时,移动 overlay 不存在
    let drawer = page.locator(".fixed.inset-0.z-50").filter({ hasText: "PAMELA" });
    await expect(drawer).toHaveCount(0);

    await page.screenshot({
      path: "/home/ubuntu/panmira-N1/.claude/r30b-mobile-1-closed.png",
    });

    // 3) 点击 hamburger 打开抽屉
    await hamburger.click();
    await page.waitForTimeout(300);

    drawer = page.locator(".fixed.inset-0.z-50").filter({ hasText: "PAMELA" });
    await expect(drawer).toBeVisible();
    // 抽屉内可见 sidebar 链接(任意一个)
    await expect(drawer.getByRole("link", { name: "任务列表" })).toBeVisible();

    await page.screenshot({
      path: "/home/ubuntu/panmira-N1/.claude/r30b-mobile-2-open.png",
    });

    // 4) 点击 backdrop(overlay 区域)关闭抽屉
    //    backdrop 是 .fixed.inset-0.z-50 内带 aria-hidden 的子元素
    //    抽屉覆盖在 backdrop 左侧,用 position 点击 backdrop 右侧(抽屉外区域)
    const backdrop = page.locator('.fixed.inset-0.z-50 > [aria-hidden="true"]');
    await backdrop.click({ timeout: 5000, position: { x: 350, y: 100 } });
    await page.waitForTimeout(300);

    await expect(drawer).toHaveCount(0);

    await page.screenshot({
      path: "/home/ubuntu/panmira-N1/.claude/r30b-mobile-3-after-close.png",
    });
  });

  test("路由切换后抽屉自动关闭", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/employees`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // 打开抽屉
    const hamburger = page.getByRole("button", { name: "打开导航菜单" });
    await hamburger.click();
    await page.waitForTimeout(300);

    const drawer = page.locator(".fixed.inset-0.z-50").filter({ hasText: "PAMELA" });
    await expect(drawer).toBeVisible();

    // 点击抽屉里的"任务列表"链接 - pathname 变化触发 useEffect 关闭
    const link = drawer.getByRole("link", { name: "任务列表" });
    await link.click();

    // 路由切换 + useEffect 关闭抽屉
    await page.waitForURL(/\/tasks/, { timeout: 10000 });
    await page.waitForTimeout(800);

    // 抽屉应该已关闭
    await expect(drawer).toHaveCount(0);
  });
});
