/**
 * R55 块3 · 新建 HR 岗位流程 e2e
 * ----------------------------------------------------------------
 * 与"数字员工创建流程"彻底区分:独立 URL /employees/hr/new,
 * 全新向导(3 步:类型 / 人格 / 发布),禁止复用数字员工向导组件。
 *
 * 覆盖 3.1-3.8:
 *   3.1 两种创建方式(blank / clone)+ 入口按钮
 *   3.2 输入框文案 岗位名称(不是 员工名称)
 *   3.3 4 类岗位类型(创意/文书/运营/业务)
 *   3.4 无"模型选择"
 *   3.5 人格定义唯一核心必填
 *   3.6 无 能力/技能/记忆/协作
 *   3.7 页面仅保留一个"发布"主按钮
 *   3.8 专属岗位模板样式(标题/副标题)
 *
 * 跑法:
 *   cd /home/ubuntu/panmira-N1/apps/web-next
 *   npx playwright test e2e/specs/r55-hr-new.spec.ts --reporter=line
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import { trackTemplate, cleanupTrackedResources, sweepTestResidue } from "../helpers/cleanup";

const BASE = "http://localhost:3200";

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

test.describe("R55 块3 · 新建 HR 岗位流程", () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });
  test.beforeAll(async ({ request }) => {
    await sweepTestResidue(request);
  });
  test.afterAll(async ({ request }) => {
    await cleanupTrackedResources(request);
  });

  // 3.1 入口:HR 列表页"新建 HR"按钮 → /employees/hr/new?mode=blank
  test("3.1a 列表页新建 HR 按钮进 blank 向导", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr`);
    const btn = page.getByTestId("hr-new");
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
    await page.waitForURL(/\/employees\/hr\/new\/?\?mode=blank/, { timeout: 10000 });
    await expect(page.getByText("新建 HR 岗位")).toBeVisible();
  });

  // 3.1 入口:卡片"复制"按钮 → /employees/hr/new?mode=clone&hrId=<id>
  test("3.1b 卡片复制按钮进 clone 向导", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr`);
    const cloneBtn = page.locator('[data-testid^="hr-clone-"]').first();
    await expect(cloneBtn).toBeVisible({ timeout: 10000 });
    await cloneBtn.click();
    await page.waitForURL(/\/employees\/hr\/new\/?\?mode=clone&hrId=/, { timeout: 10000 });
    await expect(page.getByText("新建 HR 岗位")).toBeVisible();
  });

  // 3.8 专属模板样式:标题 + 副标题
  test("3.8 页面标题与副标题(岗位说明书)", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr/new?mode=blank`);
    await expect(page.getByText("新建 HR 岗位")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/岗位说明书/)).toBeVisible();
  });

  // 3.7 stepper 3 步 + 只有一个主按钮
  test("3.7 三步向导 + 单一主按钮", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr/new?mode=blank`);
    const stepper = page.getByTestId("hr-wizard-stepper");
    await expect(stepper).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("hr-step-type")).toBeVisible();
    await expect(page.getByTestId("hr-step-persona")).toBeVisible();
    await expect(page.getByTestId("hr-step-publish")).toBeVisible();
    // footer 只有一个主按钮
    await expect(page.getByTestId("hr-wizard-primary")).toHaveCount(1);
  });

  // 3.6 + 3.4 无 数字员工专属控件(模型/技能/MCP/记忆/协作/知识库/入口)
  test("3.4+3.6 无模型/技能/记忆/协作等控件", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr/new?mode=blank`);
    const root = page.getByTestId("hr-wizard-root");
    await expect(root).toBeVisible({ timeout: 10000 });
    const banned = ["模型选择", "能力装载", "技能", "MCP", "记忆注入", "协作配置", "知识库", "入口选择", "保存草稿", "上一步"];
    for (const w of banned) {
      await expect(root.getByText(w, { exact: false })).toHaveCount(0);
    }
  });

  // 3.3 四类岗位类型
  test("3.3 四类岗位类型可见", async ({ page }) => {
    await page.goto(`${BASE}/employees/hr/new?mode=blank`);
    await expect(page.getByTestId("hr-cat-painting")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("hr-cat-copywriting")).toBeVisible();
    await expect(page.getByTestId("hr-cat-ops")).toBeVisible();
    await expect(page.getByTestId("hr-cat-business")).toBeVisible();
  });

  // 3.2 + 3.5 全链路 blank 发布:岗位名称文案 + 人格必填 → 发布回列表
  test("3.2+3.5 blank 全链路发布", async ({ page, request }) => {
    await page.goto(`${BASE}/employees/hr/new?mode=blank`);
    await expect(page.getByTestId("hr-wizard-stepper")).toBeVisible({ timeout: 10000 });

    // Step1 类型:文案是"岗位名称"不是"员工名称"
    await expect(page.getByText("岗位名称")).toBeVisible();
    await expect(page.getByText("员工名称")).toHaveCount(0);
    const uniq = `R55E2E-blank-${Date.now()}`;
    await page.getByTestId("hr-name").fill(uniq);
    await page.getByTestId("hr-cat-copywriting").click();
    await page.getByTestId("hr-wizard-primary").click();

    // Step2 人格(唯一核心必填)
    await expect(page.getByTestId("hr-persona")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("hr-persona").fill("严谨的岗位说明书写手,三风格输出,不杜撰");
    await page.getByTestId("hr-wizard-primary").click();

    // Step3 发布
    const publish = page.getByTestId("hr-wizard-primary");
    await expect(publish).toContainText("发布", { timeout: 10000 });
    await publish.click();

    // 发布后回 HR 列表
    // 只匹配列表页(/employees/hr/),不能匹配向导自身(/employees/hr/new/)
    await page.waitForURL(/\/employees\/hr\/?(\?|$)/, { timeout: 15000 });

    // 落库校验 + track 清理
    const res = await request.get(`http://localhost:9100/api/v2/agent-templates?limit=200`, {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const body = (await res.json()) as { data?: { items?: Array<{ id: string; name: string; persona?: string }> } };
    const items = body.data?.items ?? [];
    const created = items.find((t) => t.name === uniq);
    expect(created, "新建的 HR 应落库").toBeTruthy();
    if (created) trackTemplate(created.id, null, `r55:${uniq}`);
    expect(created?.persona).toContain("三风格");
  });
});
