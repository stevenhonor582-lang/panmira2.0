import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import {
  trackAgent,
  trackTemplate,
  cleanupTrackedResources,
} from "../helpers/cleanup";

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

  // R40-A: afterAll hook 把测试期间 '从真人页复制-*' 创建的 agent 一并清掉
  test.afterAll(async ({ request }) => {
    await cleanupTrackedResources(request);
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

    // Click the "复制为模板" item in the agent menu to open the modal.
    await page.locator('[data-testid^="person-agent-copy-"]').first().click();
    await page.waitForTimeout(500);

    let copyStatus = 0;
    let copyCreatedId: string | null = null;
    let copyWorkingDir: string | null = null;
    // Fill name first (the modal requires it), then submit + waitForResponse.
    const nameInput = page.getByTestId("person-copy-template-name");
    await expect(nameInput).toBeVisible();
    const newName = `从真人页复制-${Date.now()}`;
    await nameInput.fill(newName);
    const copySubmitClick = page.getByTestId("person-copy-template-submit").click();
    const copyResp = await page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        /\/api\/v2\/admin\/agents\/[0-9a-f-]+\/copy-as-template/.test(res.url()) &&
        res.status() === 201,
      { timeout: 10_000 },
    );
    copyStatus = copyResp.status();
    if (copyStatus === 201) {
      try {
        const body = await copyResp.json();
        const tpl = body?.template ?? body?.agent ?? body?.data ?? body;
        if (tpl && typeof tpl === "object") {
          if (typeof tpl.id === "string") copyCreatedId = tpl.id;
          if (typeof tpl.working_dir === "string") copyWorkingDir = tpl.working_dir;
          if (typeof tpl.workingDir === "string") copyWorkingDir = tpl.workingDir;
        }
      } catch {
        // best-effort
      }
    }
    await copySubmitClick.catch(() => undefined);
    await page.waitForTimeout(1500);

    expect(copyStatus).toBe(201);
    // R40-A: register created template for cleanup. Fallback to name-based GET
    // if res.json() failed (Playwright "Network.getResponseBody not found" race).
    if (!copyCreatedId) {
      let fbToken = "";
      if (fs.existsSync("/tmp/admin_token.txt")) {
        fbToken = fs.readFileSync("/tmp/admin_token.txt", "utf8").replace(/^TOKEN=/, "").trim();
      }
      const fbHeaders: Record<string, string> = fbToken ? { authorization: `Bearer ${fbToken}` } : {};
      const fbUrl = `${BASE.replace(":3200", ":9100")}/api/v2/employees?filter=all&limit=200`;
      for (let attempt = 1; attempt <= 3 && !copyCreatedId; attempt++) {
        try {
          const allRes = await page.request.get(fbUrl, { headers: fbHeaders });
          const body = (await allRes.json()) as {
            data?: { items?: Array<{ id: string; name: string; working_dir?: string }> };
          };
          const hit = (body?.data?.items ?? []).find((x) => x.name === newName);
          if (hit) copyCreatedId = hit.id;
          if (hit?.working_dir) copyWorkingDir = hit.working_dir;
        } catch (e) {
          // eslint-disable-next-line no-console
          console.log(`[e2e-cleanup] people-copy fallback GET attempt ${attempt}/3 ERR: ${String(e)}`);
          await page.waitForTimeout(500 * attempt);
        }
      }
    }
    if (copyCreatedId) {
      trackTemplate(copyCreatedId, copyWorkingDir, `people-copy:${newName}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[e2e-cleanup] WARN: people-copy id not captured for "${newName}"`);
    }
  });
});
