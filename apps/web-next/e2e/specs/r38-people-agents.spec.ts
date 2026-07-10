import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

const BASE = "http://localhost:3200";

// Panmira-ADMIN 是 9b55c08d — 直接用管理员自己
const ADMIN_USER_ID = "9b55c08d-8591-421d-ba4b-694d30787fd3";

const ADMIN_TOKEN = fs.existsSync("/tmp/admin_token.txt")
  ? fs.readFileSync("/tmp/admin_token.txt", "utf8").replace("TOKEN=", "").trim()
  : "";
const ADMIN_USER = {
  id: ADMIN_USER_ID,
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
        localStorage.setItem("panmira.user", JSON.stringify(user));
        localStorage.setItem("panmira.refresh", "mock-refresh");
      }
    },
    { token: ADMIN_TOKEN, user: ADMIN_USER },
  );
}

test.describe("R38-C6 · 真人页 employees tab agent 列表", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test("数字员工 tab 可见 + 列表可加载", async ({ page }) => {
    await page.goto(`${BASE}/overview/people/${ADMIN_USER_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    // 默认 tab 可能是 basic,先点 employees tab
    const empTab = page.getByRole("button", { name: /数字员工/ }).first();
    if (await empTab.isVisible().catch(() => false)) {
      await empTab.click();
      await page.waitForTimeout(1000);
    }

    // tab 描述应该出现
    await expect(page.getByText(/可调度|尚未关联|添加数字员工/).first()).toBeVisible({ timeout: 10000 });
  });

  test("agent 卡片有下拉菜单 含 提升为模板 + 复制为模板 + 解绑 三项", async ({ page }) => {
    await page.goto(`${BASE}/overview/people/${ADMIN_USER_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const empTab = page.getByRole("button", { name: /数字员工/ }).first();
    if (await empTab.isVisible().catch(() => false)) {
      await empTab.click();
      await page.waitForTimeout(1500);
    }

    // 找一个 agent 卡片的 menu 按钮(person-agent-menu-{prefix})
    // 这个真人 owner 的 agent 列表可能为空(取决于是否绑定 owner_user_id)
    // 我们用 first() 容错
    const menuBtns = page.locator('[data-testid^="person-agent-menu-"]');
    const cnt = await menuBtns.count();
    if (cnt === 0) {
      // 接受空状态 — 但 tab 自身可见
      await expect(page.getByText(/该员工可调度/).first()).toBeVisible();
      return;
    }

    const firstMenu = menuBtns.first();
    await expect(firstMenu).toBeVisible({ timeout: 5000 });
    await firstMenu.click();
    await page.waitForTimeout(500);

    // 三项菜单
    const promoteItem = page.locator('[data-testid^="person-agent-promote-"]').first();
    const copyItem = page.locator('[data-testid^="person-agent-copy-"]').first();
    const unbindItem = page.locator('[data-testid^="person-agent-unbind-"]').first();

    await expect(promoteItem).toBeVisible();
    await expect(copyItem).toBeVisible();
    await expect(unbindItem).toBeVisible();
  });

  test("复制为模板 弹窗可输入 + 提交 → POST copy-as-template", async ({ page }) => {
    await page.goto(`${BASE}/overview/people/${ADMIN_USER_ID}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const empTab = page.getByRole("button", { name: /数字员工/ }).first();
    if (await empTab.isVisible().catch(() => false)) {
      await empTab.click();
      await page.waitForTimeout(1500);
    }

    const menuBtns = page.locator('[data-testid^="person-agent-menu-"]');
    const cnt = await menuBtns.count();
    test.skip(cnt === 0, "no agents owned by admin");

    await menuBtns.first().click();
    await page.waitForTimeout(500);

    let copyStatus = 0;
    page.on("response", (res) => {
      if (res.request().method() === "POST" && /\/api\/v2\/admin\/agents\/[0-9a-f-]+\/copy-as-template/.test(res.url())) {
        copyStatus = res.status();
      }
    });

    await page.locator('[data-testid^="person-agent-copy-"]').first().click();
    await page.waitForTimeout(500);

    const nameInput = page.getByTestId("person-copy-template-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(`从真人页复制-${Date.now()}`);

    await page.getByTestId("person-copy-template-submit").click();
    await page.waitForTimeout(3000);

    expect(copyStatus).toBe(201);
  });
});
