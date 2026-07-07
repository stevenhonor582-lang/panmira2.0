import { test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOT_DIR = "/home/ubuntu/panmira-N1/.claude/screenshots";
mkdirSync(SHOT_DIR, { recursive: true });

const SHIDEFEI_ID = "9b55c08d-8591-421d-ba4b-694d30787fd3";
const BUYING_ID = "c5bf8d20-90f4-4780-95cc-ed866651b3c8";
const PIPELINE_ID = "ed7d4ff4-22b7-4417-ba9f-4a08cdbe5624";

async function shot(page: Page, name: string): Promise<void> {
  const path = `${SHOT_DIR}/${name}.png`;
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.screenshot({ path, fullPage: false });
  console.log(`[shot] ${name}.png`);
}

async function login(page: Page): Promise<void> {
  await page.goto("/login/");
  await page.fill("#email", "20218181@qq.com");
  await page.fill("#password", "shidefei@2026");
  await Promise.all([
    page.waitForURL(/\/overview\/dashboard\//, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

test.describe.serial("A_login", () => {
  test("A1_login_form", async ({ page }) => {
    await page.goto("/login/");
    await shot(page, "a-login");
  });

  test("A2_login_then_overview", async ({ page }) => {
    await page.goto("/login/");
    await page.fill("#email", "20218181@qq.com");
    await page.fill("#password", "shidefei@2026");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/overview\/dashboard\//, { timeout: 15000 });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await shot(page, "a-overview-after-login");
  });
});

test.describe.serial("B_overview", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("B1_dashboard", async ({ page }) => {
    await page.goto("/overview/dashboard/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await shot(page, "b-overview-dashboard");
  });

  test("B2_people", async ({ page }) => {
    await page.goto("/overview/people/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "b-overview-people");
  });

  test("B3_shidefei_detail", async ({ page }) => {
    await page.goto(`/overview/people/${SHIDEFEI_ID}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "b-overview-shidefei");
  });
});

test.describe.serial("C_employees", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("C1_gallery", async ({ page }) => {
    await page.goto("/employees/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "c-employees-gallery");
  });

  test("C2_detail", async ({ page }) => {
    await page.goto(`/employees/${BUYING_ID}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "c-employees-detail");
  });

  test("C3_wizard", async ({ page }) => {
    await page.goto("/employees/new/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(400);
    await shot(page, "c-employees-wizard");
  });
});

test.describe.serial("D_foundation", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("D1_memory_l1", async ({ page }) => {
    await page.goto("/foundation/memory/l1/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "d-foundation-l1");
  });

  test("D2_knowledge", async ({ page }) => {
    await page.goto("/foundation/knowledge/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);
    await shot(page, "d-foundation-knowledge");
  });
});

test.describe.serial("E_tasks", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("E1_list", async ({ page }) => {
    await page.goto("/tasks/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "e-tasks-list");
  });

  test("E2_new_placeholder", async ({ page }) => {
    await page.goto("/tasks/new/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await shot(page, "e-tasks-dag-placeholder");
  });

  test("E3_detail_with_tldraw", async ({ page }) => {
    await page.goto(`/tasks/${PIPELINE_ID}/`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await shot(page, "e-tasks-detail");
  });
});

test.describe.serial("F_channels", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("F1_llm", async ({ page }) => {
    await page.goto("/channels/llm/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "f-channels-llm");
  });

  test("F2_endpoints_outbound", async ({ page }) => {
    await page.goto("/channels/endpoints/?tab=outbound");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    await shot(page, "f-channels-endpoints-outbound");
  });

  test("F3_oauth", async ({ page }) => {
    await page.goto("/channels/oauth/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(600);
    await shot(page, "f-channels-oauth");
  });
});
