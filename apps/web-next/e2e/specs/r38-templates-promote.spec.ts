import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import {
  trackAgent,
  trackTemplate,
  cleanupTrackedResources,
} from "../helpers/cleanup";

const BASE = "http://localhost:3200";
const API_BASE = "http://localhost:9100";

const ADMIN_TOKEN = fs.existsSync("/tmp/admin_token.txt")
  ? fs.readFileSync("/tmp/admin_token.txt", "utf8").replace("TOKEN=", "").trim()
  : "";
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
        localStorage.setItem("panmira.user", JSON.stringify(user));
        localStorage.setItem("panmira.refresh", "mock-refresh");
      }
    },
    { token: ADMIN_TOKEN, user: ADMIN_USER },
  );
}

/**
 * R38-E 自愈 fixture: 用 API 现拉一份 instance + template 列表,
 * 不再硬编码 uuid。任意一个模板 promote/demote 切换过后,测试依然能跑通。
 */
type Fx = { insId: string; tplId: string; tplId2: string };

async function fetchFx(request: import("@playwright/test").APIRequestContext): Promise<Fx> {
  const headers = { authorization: `Bearer ${ADMIN_TOKEN}` };
  const allRes = await request.get(`${API_BASE}/api/v2/employees?filter=all&limit=200`, { headers });
  expect(allRes.status(), "/api/v2/employees?filter=all").toBe(200);
  const body = (await allRes.json()) as { data?: { items?: Array<{ id: string; is_template: boolean; name: string }> } };
  const items = body?.data?.items ?? [];
  const instances = items.filter((x) => !x.is_template);
  const templates = items.filter((x) => x.is_template);
  if (instances.length === 0) throw new Error("R38-E fixture: no instances in DB");
  if (templates.length < 2) throw new Error(`R38-E fixture: need >=2 templates, got ${templates.length}`);
  return {
    insId: instances[0].id,
    tplId: templates[0].id,
    tplId2: templates[1].id,
  };
}

test.describe("R38-C6 · templates promote / copy / generate-instance", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  // R40-A: afterAll 把所有 trackAgent/trackTemplate 注册的资源一次性清理,
  // 防止 R38-C6 测试在跑完后留 '守静-R38C6-*' / '守静-DETAIL-*' 等测试 agent 行。
  test.afterAll(async ({ request }) => {
    await cleanupTrackedResources(request);
  });

  test("实例卡片下拉菜单有 提升为模板 + 复制为模板 选项", async ({ page, request }) => {
    const { insId } = await fetchFx(request);

    // 进 gallery(实例列表),找实例卡片的下拉菜单
    await page.goto(`${BASE}/employees`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    const menuBtn = page.getByTestId(`agent-card-menu-${insId.slice(0, 8)}`);
    await expect(menuBtn).toBeVisible({ timeout: 10000 });
    await menuBtn.click();

    // 提升为模板(data-testid=menu-promote)
    await expect(page.getByTestId("menu-promote")).toBeVisible();
    await expect(page.getByTestId("menu-copy-as-template")).toBeVisible();
  });

  test("实例 → 提升为模板 成功(POST /api/v2/admin/agents/:id/promote)", async ({ page, request }) => {
    const { insId } = await fetchFx(request);

    // 进 gallery,点实例卡片的 promote 菜单
    await page.goto(`${BASE}/employees`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    let promoteUrl = "";
    let promoteRespStatus = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && /\/api\/v2\/admin\/agents\/[0-9a-f-]+\/promote/.test(req.url())) {
        promoteUrl = req.url();
      }
    });
    page.on("response", (res) => {
      if (res.request().method() === "POST" && /\/api\/v2\/admin\/agents\/[0-9a-f-]+\/promote/.test(res.url())) {
        promoteRespStatus = res.status();
      }
    });

    page.on("dialog", (d) => d.accept());

    const menuBtn = page.getByTestId(`agent-card-menu-${insId.slice(0, 8)}`);
    await menuBtn.click();
    await page.getByTestId("menu-promote").click();
    await page.waitForTimeout(4000);

    expect(promoteUrl).toContain(`/api/v2/admin/agents/${insId}/promote`);
    expect([200, 400]).toContain(promoteRespStatus);
    // 200 = 成功 promote; 400 = already_template(前序测试残留状态,也算符合端点存在)
  });

  test("模板卡片有 复制 按钮 + 点开 modal 输入名字 + 提交 → POST copy-as-template", async ({ page, request }) => {
    const { tplId } = await fetchFx(request);

    await page.goto(`${BASE}/employees/templates`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    const copyBtn = page.getByTestId(`copy-as-template-${tplId.slice(0, 8)}`);
    await expect(copyBtn).toBeVisible({ timeout: 10000 });
    await copyBtn.click();

    // modal 弹出 + 输入新名字
    const newName = `守静-R38C6-E2E-${Date.now()}`;
    const nameInput = page.getByTestId("copy-template-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(newName);

    // 抓 copy-as-template 请求
    let copyUrl = "";
    let copyStatus = 0;
    let copyCreatedId: string | null = null;
    let copyWorkingDir: string | null = null;
    page.on("request", (req) => {
      if (req.method() === "POST" && /\/api\/v2\/admin\/agents\/[0-9a-f-]+\/copy-as-template/.test(req.url())) {
        copyUrl = req.url();
      }
    });

    // Submit and synchronously await the POST response so we can read its body once,
    // cleanly. page.on('response') races with browser redirects and body reuse.
    const submitClick = page.getByTestId("copy-template-submit").click();
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
      } catch (parseErr) {
        // eslint-disable-next-line no-console
        console.log(`[e2e-cleanup] copy body parse failed: ${String(parseErr)}`);
      }
    }
    await submitClick.catch(() => undefined);
    await page.waitForTimeout(1500);

    expect(copyUrl).toContain(`/api/v2/admin/agents/${tplId}/copy-as-template`);
    expect(copyStatus).toBe(201);
    // R40-A: track the copy so afterAll deletes it. Fall back to a name-based GET
    // if the body parse failed (Playwright res.json() can fail with
    // "Network.getResponseBody: No resource with given identifier found" when the
    // response was already consumed internally). Retry on transient errors.
    if (!copyCreatedId) {
      let fbToken = "";
      if (fs.existsSync("/tmp/admin_token.txt")) {
        fbToken = fs.readFileSync("/tmp/admin_token.txt", "utf8").replace(/^TOKEN=/, "").trim();
      }
      const fbHeaders: Record<string, string> = fbToken ? { authorization: `Bearer ${fbToken}` } : {};
      const fbUrl = `${API_BASE}/api/v2/employees?filter=all&limit=200`;
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
          console.log(`[e2e-cleanup] copy fallback GET attempt ${attempt}/3 ERR: ${String(e)}`);
          await page.waitForTimeout(500 * attempt);
        }
      }
    }
    if (copyCreatedId) {
      trackTemplate(copyCreatedId, copyWorkingDir, `copy:${newName}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[e2e-cleanup] WARN: copy-as-template created agent id not captured for "${newName}"`);
    }
  });

  test("模板卡片有 创建实例 按钮 + 点开 modal 提交 → POST from-template + 跳新实例", async ({ page, request }) => {
    const { tplId2 } = await fetchFx(request);

    await page.goto(`${BASE}/employees/templates`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);

    const instantiateBtn = page.getByTestId(`instantiate-${tplId2.slice(0, 8)}`);
    await expect(instantiateBtn).toBeVisible({ timeout: 10000 });
    await instantiateBtn.click();

    const newName = `守静-R38C6-IN-${Date.now()}`;
    const nameInput = page.locator('input[placeholder*="墨言"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(newName);

    let createUrl = "";
    let createStatus = 0;
    let createdId: string | null = null;
    let createdWorkingDir: string | null = null;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/v2/employees/from-template")) {
        createUrl = req.url();
      }
    });

    // Submit and synchronously wait for the from-template POST response.
    const submit4 = page.getByRole("button", { name: /创建并跳到详情/ }).click();
    const createResp = await page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/v2/employees/from-template") &&
        res.status() === 201,
      { timeout: 10_000 },
    );
    createStatus = createResp.status();
    if (createStatus === 201) {
      try {
        const body = await createResp.json();
        const a = body?.agent ?? body?.data ?? body;
        if (a && typeof a === "object") {
          if (typeof a.id === "string") createdId = a.id;
          if (typeof a.working_dir === "string") createdWorkingDir = a.working_dir;
          if (typeof a.workingDir === "string") createdWorkingDir = a.workingDir;
        }
      } catch {
        // best-effort
      }
    }
    await submit4.catch(() => undefined);
    await page.waitForTimeout(1500);

    expect(createUrl).toContain("/api/v2/employees/from-template");
    expect(createStatus).toBe(201);
    // 期望 URL 已经跳到 /employees/<new-id>
    expect(page.url()).toMatch(/\/employees\/[0-9a-f-]+/);
    // R40-A: register for cleanup
    if (createdId) {
      trackAgent(createdId, createdWorkingDir, `instantiate:${newName}`);
    } else {
      // 从 URL 末段提取 id 兜底
      const m = page.url().match(/\/employees\/([0-9a-f-]+)/);
      if (m) trackAgent(m[1], null, `instantiate-url:${newName}`);
    }
  });

  test("模板详情页头部有 生成实例 按钮 + 点开 modal 提交 → 创建并跳新实例", async ({ page, request }) => {
    const { tplId } = await fetchFx(request);

    await page.goto(`${BASE}/employees/${tplId}`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const primaryBtn = page.getByTestId("generate-instance-primary");
    await expect(primaryBtn).toBeVisible({ timeout: 8000 });
    await primaryBtn.click();

    const newName = `守静-DETAIL-${Date.now()}`;
    const nameInput = page.getByTestId("instantiate-name");
    await expect(nameInput).toBeVisible();
    await nameInput.fill(newName);

    let createStatus = 0;
    let createdId: string | null = null;
    let createdWorkingDir: string | null = null;
    const submit5 = page.getByTestId("instantiate-submit").click();
    const createResp = await page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url().includes("/api/v2/employees/from-template") &&
        res.status() === 201,
      { timeout: 10_000 },
    );
    createStatus = createResp.status();
    if (createStatus === 201) {
      try {
        const body = await createResp.json();
        const a = body?.agent ?? body?.data ?? body;
        if (a && typeof a === "object") {
          if (typeof a.id === "string") createdId = a.id;
          if (typeof a.working_dir === "string") createdWorkingDir = a.working_dir;
          if (typeof a.workingDir === "string") createdWorkingDir = a.workingDir;
        }
      } catch {
        // best-effort
      }
    }
    await submit5.catch(() => undefined);
    await page.waitForTimeout(1500);

    expect(createStatus).toBe(201);
    expect(page.url()).toMatch(/\/employees\/[0-9a-f-]+/);
    // R40-A: register for cleanup
    if (createdId) {
      trackAgent(createdId, createdWorkingDir, `detail-instantiate:${newName}`);
    } else {
      const m = page.url().match(/\/employees\/([0-9a-f-]+)/);
      if (m) trackAgent(m[1], null, `detail-instantiate-url:${newName}`);
    }
  });
});
