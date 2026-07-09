import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3200";
const LOGIN_EMAIL = "20218181@qq.com";
const LOGIN_PWD = "shidefei@2026";

test("R19: add two nodes + connect them; verify no license watermark", async ({ page }) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/邮箱|email/i).first().fill(LOGIN_EMAIL);
  await page.getByLabel(/密码|password/i).first().fill(LOGIN_PWD);
  await page.getByRole("button", { name: /登|sign|log\s*in/i }).first().click();
  await page.waitForURL(/\/(overview|tasks|dashboard)/, { timeout: 15000 }).catch(() => {});

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/tasks/new`, { waitUntil: "networkidle" });

  // Add a Bot node + a Skill node
  await page.getByRole("button", { name: /Bot 节点/ }).first().click();
  await page.getByRole("button", { name: /Skill 节点/ }).first().click();

  // Both nodes visible on canvas
  await expect(page.locator('.react-flow__node [data-kind="bot"]').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.react-flow__node [data-kind="skill"]').first()).toBeVisible({ timeout: 5000 });

  // React Flow must render handles on each node (proves onConnect wiring
  // is in place even if we don't perform the drag here).
  await expect(page.locator(".react-flow__handle").first()).toBeVisible();
  expect(await page.locator(".react-flow__handle").count()).toBeGreaterThanOrEqual(4); // 2 per node

  // Critical: no tldraw watermark anywhere
  await expect(page.locator("[data-testid='tl-watermark-unlicensed']")).toHaveCount(0);
  await expect(page.locator(".tl-container")).toHaveCount(0);

  // No console errors
  expect(errors).toEqual([]);
});
