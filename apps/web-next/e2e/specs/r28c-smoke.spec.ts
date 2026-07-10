import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3200";
const LOGIN = { email: "20218181@qq.com", password: "shidefei@2026" };

async function login(page) {
  await page.goto(`${BASE}/login/`);
  await page.fill('input[type="email"]', LOGIN.email);
  await page.fill('input[type="password"]', LOGIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/(overview|employees|dashboard)/, { timeout: 15000 }).catch(() => {});
}

test("R28-C: skills tab renders KB two zones + tools default/extra", async ({ page }) => {
  await login(page);
  // 拿一个实例 agent id
  const list = await page.goto(`${BASE}/employees/`).then(() => page.content());
  await page.goto(`${BASE}/employees/`);
  await page.waitForLoadState("networkidle");
  const href = await page.locator('a[href*="/employees/"][href*="-"]').first().getAttribute("href").catch(() => null);
  const id = href ? href.split("/").filter(Boolean).pop() : null;
  if (!id) { console.log("no agent id; skip"); return; }
  await page.goto(`${BASE}/employees/${id}/`);
  await page.waitForLoadState("networkidle");
  // 进入技能 tab
  const skillsTab = page.getByRole("tab", { name: /技能|skills/i }).first();
  if (await skillsTab.isVisible().catch(() => false)) await skillsTab.click();
  await page.waitForTimeout(800);
  const body = await page.textContent("body");
  // ⑦ 知识库两区标题 — R50-2: "公共知识库" 已重命名为"组织公共知识区",
  // 第二区表达改为"个人 / 群组 / 私人"被自动隐藏的权限隔离文案。
  expect.soft(body, "组织公共知识区").toContain("组织公共知识区");
  expect.soft(body, "已自动隐藏").toContain("已自动隐藏");
  // 权限隔离提示
  expect.soft(body, "权限隔离").toContain("权限隔离");
  // ⑧ 工具:默认已启用 + 额外
  expect.soft(body, "默认已启用").toContain("默认已启用");
  expect.soft(body, "额外").toContain("额外");
  console.log("R28-C skills tab OK, agent:", id);
});

test("R28-C: memory tab single stats + theme summary + agent lock", async ({ page }) => {
  await login(page);
  await page.goto(`${BASE}/employees/`);
  await page.waitForLoadState("networkidle");
  const href = await page.locator('a[href*="/employees/"][href*="-"]').first().getAttribute("href").catch(() => null);
  const id = href ? href.split("/").filter(Boolean).pop() : null;
  if (!id) { console.log("no agent id; skip"); return; }
  await page.goto(`${BASE}/employees/${id}/`);
  await page.waitForLoadState("networkidle");
  const memTab = page.getByRole("tab", { name: /记忆|memory/i }).first();
  if (await memTab.isVisible().catch(() => false)) await memTab.click();
  await page.waitForTimeout(800);
  const body = await page.textContent("body");
  // ⑨ 主题归纳
  expect.soft(body, "主题归纳").toContain("主题归纳");
  // 锁定本 Agent 提示
  expect.soft(body, "已锁定").toContain("已锁定");
  // 跳转链接含 botId
  const jump = page.locator('[data-testid="memory-jump-full"]');
  if (await jump.isVisible().catch(() => false)) {
    const link = await jump.getAttribute("href");
    expect.soft(link, "jump link botId").toContain("botId=");
  }
  console.log("R28-C memory tab OK, agent:", id);
});
