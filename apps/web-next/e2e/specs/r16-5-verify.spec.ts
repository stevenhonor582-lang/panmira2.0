import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";

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
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem("panmira.token", token);
      localStorage.setItem("panmira.user", JSON.stringify(user));
      localStorage.setItem("panmira.refresh", "mock-refresh");
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
}

test.describe.configure({ mode: "serial" });

test("R16-5 verify feedback sessions + AISuggestion", async ({ page }) => {
  await loginAdmin(page);
  await page.goto("http://localhost:3200/foundation/feedback/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);

  // Capture page HTML structure (text content)
  const txt = await page.locator("body").innerText();

  await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-feedback-sessions.png", fullPage: true });

  // Check sessions cards exist with bot/cp badges
  const sessionCards = await page.locator("button:has-text('🤖')").count();
  console.log(`[feedback] session cards with 🤖 badge: ${sessionCards}`);

  // Check stats tile exists
  const statsTiles = await page.locator("text=活跃数字员工").count();
  console.log(`[feedback] 活跃数字员工 stats tile: ${statsTiles}`);

  // Click first session → drawer
  const firstCard = page.locator("button:has-text('🤖')").first();
  if (await firstCard.isVisible().catch(() => false)) {
    await firstCard.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-feedback-msgflow.png", fullPage: true });
  }

  // Visit diagnosis
  await page.goto("http://localhost:3200/overview/diagnosis/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-diagnosis-ai.png", fullPage: true });

  // Check AISuggestionList rendered
  const aiList = await page.locator("section:has-text('优化建议')").count();
  console.log(`[diagnosis] AI suggestion list rendered: ${aiList}`);

  // Visit logs
  await page.goto("http://localhost:3200/overview/logs/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-logs-ai.png", fullPage: true });

  // Open AI analysis panel if button exists
  const analyzeBtn = page.getByRole("button", { name: /AI 分析|智能分析|分析/ }).first();
  if (await analyzeBtn.isVisible().catch(() => false)) {
    await analyzeBtn.click().catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-logs-analyze.png", fullPage: true });
  }

  // Visit dashboard
  await page.goto("http://localhost:3200/overview/dashboard/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/home/ubuntu/panmira-N1/.claude/r16-5-dashboard.png", fullPage: true });

  // Sanity assertions
  expect(statsTiles).toBeGreaterThan(0);
  expect(aiList).toBeGreaterThan(0);
});
