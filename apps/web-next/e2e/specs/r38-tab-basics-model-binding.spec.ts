import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

/**
 * R38-C5 · 阶段 4.1 / 4.2 / 4.4: tab-basics 保存后立即刷新 + modelId 写入 + tab-memory 跳链带 agentId
 */

const BASE = "http://localhost:3200";
const EMP_ID = "1634063d-5862-4230-93d3-1aa166ba0a1c";
const ADMIN_TOKEN = fs.existsSync("/tmp/admin_token.txt")
  ? fs.readFileSync("/tmp/admin_token.txt", "utf8").replace("TOKEN=", "").trim()
  : "";
const ADMIN_USER = { id: "9b55c08d-8591-421d-ba4b-694d30787fd3", email: "20218181@qq.com", name: "史德飞", role: "admin", tenantId: "491c000f-7e34-4a6e-a561-d8a948c6e429" };

async function loginAdmin(page: Page) {
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem("panmira.token", token);
      localStorage.setItem("panmira.user", JSON.stringify(user));
      localStorage.setItem("panmira.refresh", "mock-refresh");
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
}

test.describe("R38-C5 · tab-basics model binding + memory agentId link", () => {
  test.beforeEach(async ({ page }) => { await loginAdmin(page); });

  test("tab-basics 加载 + 专属大模型卡片可见", async ({ page }) => {
    await page.goto(`${BASE}/employees/${EMP_ID}?tab=basics`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    await expect(page.getByText("专属大模型", { exact: false }).first()).toBeVisible({ timeout: 8000 });
  });

  test("切换不同 model → PATCH body 含 modelId + default_model 联动", async ({ page }) => {
    await page.goto(`${BASE}/employees/${EMP_ID}?tab=basics`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // 监听 PATCH 请求
    let patchBody: Record<string, unknown> | null = null;
    let patchUrl = "";
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes(`/api/v2/employees/${EMP_ID}`)) {
        patchUrl = req.url();
        try { patchBody = JSON.parse(req.postData() ?? "{}"); } catch { patchBody = null; }
      }
    });

    // 取消"遵循全局路由"勾选(否则单选 disabled,不能切模型)
    const routingToggle = page.locator('label:has-text("遵循全局路由") input[type="checkbox"]').first();
    if ((await routingToggle.count()) > 0) {
      const wasChecked = await routingToggle.isChecked();
      if (wasChecked) await routingToggle.click();
    }
    await page.waitForTimeout(300);

    // 找到当前未选中的 radio(不依赖 nth 索引)
    const allRadios = page.locator('input[type="radio"][name="model-binding"]:not([disabled])');
    const total = await allRadios.count();
    expect(total).toBeGreaterThan(1);

    let targetIdx = -1;
    for (let i = 0; i < total; i++) {
      const checked = await allRadios.nth(i).isChecked();
      if (!checked) { targetIdx = i; break; }
    }
    expect(targetIdx).toBeGreaterThanOrEqual(0);
    await allRadios.nth(targetIdx).check({ force: true });
    await page.waitForTimeout(400);

    // 保存按钮应启用
    const saveBtn = page.getByTestId("save-model-binding");
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeEnabled({ timeout: 5000 });
    await saveBtn.click();
    await page.waitForTimeout(3000);

    // 断言 PATCH body
    expect(patchBody).not.toBeNull();
    expect(patchUrl).toContain(EMP_ID);
    // R50-3: 页面已对齐后端 PATCH handler,R38-E 显式声明写 model_id(snake_case)。
    // 修复前断言 camelCase modelId,与真实 PATCH body 不符。
    expect(patchBody).toHaveProperty("model_id");
    expect(typeof (patchBody as Record<string, unknown>).model_id).toBe("string");
    expect(((patchBody as Record<string, unknown>).model_id as string).length).toBeGreaterThan(0);
    expect(patchBody).toHaveProperty("default_model");
    expect(patchBody).toHaveProperty("default_engine");
  });

  test("tab-memory 跳链 URL 含 agentId 参数", async ({ page }) => {
    await page.goto(`${BASE}/employees/${EMP_ID}?tab=memory`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const jumpLink = page.getByTestId("memory-jump-full");
    await expect(jumpLink).toBeVisible({ timeout: 8000 });

    const href = await jumpLink.getAttribute("href");
    expect(href).not.toBeNull();
    expect(href).toContain("agentId=");
    expect(href).toContain(encodeURIComponent(EMP_ID));
    expect(href).toContain("botId=");
  });
});
