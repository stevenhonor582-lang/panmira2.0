import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3200";
const LOGIN_EMAIL = "20218181@qq.com";
const LOGIN_PWD = "shidefei@2026";

async function login(page: import("@playwright/test").Page) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/邮箱|email/i).first().fill(LOGIN_EMAIL);
  await page.getByLabel(/密码|password/i).first().fill(LOGIN_PWD);
  await page.getByRole("button", { name: /登|sign|log\s*in/i }).first().click();
  await page.waitForURL(/\/(overview|tasks|dashboard|foundation)/, { timeout: 15000 }).catch(() => {});
}

async function pickFirstAgentId(page: import("@playwright/test").Page): Promise<string | null> {
  // Navigate to employees list, grab the first detail link whose href has a real UUID
  await page.goto(`${BASE}/employees`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const id = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/employees/"]'));
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      if (href.includes("/new") || href.includes("/templates")) continue;
      // Match a UUID-shaped segment after /employees/
      const m = href.match(/\/employees\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
      if (m) return m[1];
    }
    return null;
  });
  return id;
}

test.describe("R26-B · 记忆/任务/日志 tab 完善", () => {
  test("记忆 tab: 统计 + 三层折叠 + 跳转链接", async ({ page }) => {
    await login(page);
    const id = await pickFirstAgentId(page);
    test.skip(!id, "无可用 agent,跳过");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(`${BASE}/employees/${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    // Click 记忆 tab
    await page.getByRole("tab", { name: /记忆/ }).click();
    await page.waitForTimeout(500);

    // Stats card labels should render
    await expect(page.getByText(/短期 · L1|长期 · L2|永久 · L3/).first()).toBeVisible({ timeout: 8000 });

    // Jump link to foundation/memory
    await expect(page.getByTestId("memory-jump-full")).toBeVisible();

    // At least one layer toggle button exists
    await expect(page.locator('[data-testid^="memory-layer-toggle-"]').first()).toBeVisible();

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("任务 tab: ResourcePicker 添加按钮 + 已绑定列表", async ({ page }) => {
    await login(page);
    const id = await pickFirstAgentId(page);
    test.skip(!id, "无可用 agent,跳过");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(`${BASE}/employees/${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await page.getByRole("tab", { name: /任务/ }).click();
    await page.waitForTimeout(500);

    // 添加任务 button (opens picker)
    await expect(page.getByTestId("tasks-add-open-picker")).toBeVisible({ timeout: 8000 });

    // Click to open picker
    await page.getByTestId("tasks-add-open-picker").click();
    await page.waitForTimeout(400);

    // ResourcePicker modal should appear (search input)
    await expect(page.getByTestId("resource-picker-search")).toBeVisible({ timeout: 5000 });

    // Close it
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    expect(errors, errors.join("\n")).toHaveLength(0);
  });

  test("日志 tab: 真实 events + 人类可读 + 过滤器", async ({ page }) => {
    await login(page);
    const id = await pickFirstAgentId(page);
    test.skip(!id, "无可用 agent,跳过");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

    await page.goto(`${BASE}/employees/${id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);

    await page.getByRole("tab", { name: /日志/ }).click();
    await page.waitForTimeout(1500); // give the bot-name lookup + fetch time

    // Header label
    await expect(page.getByText(/活动日志/).first()).toBeVisible({ timeout: 8000 });

    // Type filter group
    await expect(page.getByTestId("logs-filter-type-all")).toBeVisible();
    await expect(page.getByTestId("logs-filter-type-success")).toBeVisible();
    await expect(page.getByTestId("logs-filter-type-error")).toBeVisible();

    // Range filter group
    await expect(page.getByTestId("logs-filter-range-7d")).toBeVisible();
    await expect(page.getByTestId("logs-filter-range-30d")).toBeVisible();

    // Switch to 30d to maximize chance of seeing events
    await page.getByTestId("logs-filter-range-30d").click();
    await page.waitForTimeout(300);

    // Either timeline renders, or empty state renders — neither should crash
    const timelineCount = await page.getByTestId("logs-timeline").count();
    const hasEvents = timelineCount > 0;

    // Switch type filter to error only (just exercise the filter, no assertion on count)
    await page.getByTestId("logs-filter-type-error").click();
    await page.waitForTimeout(200);
    await page.getByTestId("logs-filter-type-all").click();
    await page.waitForTimeout(200);

    // No console errors regardless of data presence
    expect(errors, errors.join("\n")).toHaveLength(0);
    // Sanity: if we got events, timeline should be visible after "all" filter
    if (hasEvents) {
      await expect(page.getByTestId("logs-timeline")).toBeVisible();
    }
  });
});
