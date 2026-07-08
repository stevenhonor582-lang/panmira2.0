import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3200";
const LOGIN_EMAIL = "20218181@qq.com";
const LOGIN_PWD = "shidefei@2026";

test("canvas smoke: /tasks/new shows tldraw, no spinner after wait", async ({ page }) => {
  // Login first
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/邮箱|email/i).first().fill(LOGIN_EMAIL);
  await page.getByLabel(/密码|password/i).first().fill(LOGIN_PWD);
  await page.getByRole("button", { name: /登|sign|log\s*in/i }).first().click();
  await page.waitForURL(/\/(overview|tasks|dashboard)/, { timeout: 15000 }).catch(() => {});

  // Capture console errors
  const canvasErrors: string[] = [];
  page.on("pageerror", (e) => canvasErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/tasks/new`, { waitUntil: "networkidle" });

  // The palette sidebar should be visible
  await expect(page.getByText(/Bot 节点|数字员工/i).first()).toBeVisible({ timeout: 8000 });

  // The spinner text "画布加载中" should disappear within 8s
  await expect(page.getByText("画布加载中")).toBeHidden({ timeout: 8000 });

  // tldraw canvas should mount (.tl-container or canvas element)
  await expect(page.locator(".tl-container, [data-testid='tl-container']").first()).toBeVisible({ timeout: 8000 });

  // Click "Bot 节点" in palette to add a node
  await page.getByRole("button", { name: /Bot 节点/ }).first().click();

  // A dag-node shape should appear on canvas
  await expect(page.locator('[data-kind="bot"]').first()).toBeVisible({ timeout: 5000 });

  // Verify no fatal pageerrors referencing tldraw
  const fatal = canvasErrors.filter((m) => m.toLowerCase().includes("tldraw") && !m.includes("license"));
  expect(fatal).toEqual([]);
});
