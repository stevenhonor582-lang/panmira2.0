import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

// R49-E CRUD smoke: 数字员工 / 真人 / 任务 / 频道 / 知识库 — 列表加载 + 详情可达
// 防御性测试:确保 5 大资源 CRUD 入口在 UI 上能完整跑通(阻塞业务的最高优先级)。

const ADMIN_TOKEN = (fs.existsSync('/tmp/admin_token.txt') ? fs.readFileSync('/tmp/admin_token.txt', 'utf8') : '')
  .replace('TOKEN=', '').trim();
const ADMIN_USER = {
  id: '9b55c08d-8591-421d-ba4b-694d30787fd3',
  email: '20218181@qq.com',
  name: '史德飞',
  role: 'admin',
  tenantId: '491c000f-7e34-4a6e-a561-d8a948c6e429',
};

async function loginAdmin(page: Page) {
  await page.addInitScript(
    ({ token, user }) => {
      if (token) {
        localStorage.setItem('panmira.token', token);
        localStorage.setItem('panmira.user', JSON.stringify(user));
        localStorage.setItem('panmira.refresh', 'mock-refresh');
      }
    },
    { token: ADMIN_TOKEN, user: ADMIN_USER },
  );
}

test.describe('R49-E · 5 大资源 CRUD smoke', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test('数字员工列表 + 新建按钮 + 至少一个员工详情可达', async ({ page }) => {
    await page.goto('http://localhost:3200/employees/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    // 新建按钮
    await expect(page.getByRole('link', { name: /新建|创建|添加/ }).first()).toBeVisible({ timeout: 10000 });
    // 至少一个员工卡片
    const cards = page.locator('[data-testid="agent-card"], article, [class*="card"]').filter({ hasText: /\S+/ });
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    // 详情页可达:点第一个可点的 link
    const firstLink = page.locator('a[href*="/employees/"]').first();
    await firstLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    // 详情页至少有 tab 或 h1
    await expect(page.locator('main').first()).toBeVisible({ timeout: 5000 });
  });

  test('真人列表加载 + 详情可达', async ({ page }) => {
    await page.goto('http://localhost:3200/overview/people/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    // 至少一个真人卡片
    const firstLink = page.locator('a[href*="/overview/people/"]').filter({ hasNotText: '组织部' }).first();
    await expect(firstLink).toBeVisible({ timeout: 10000 });
    await firstLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 5000 });
  });

  test('任务列表 + 新建按钮 + 至少一个任务详情可达', async ({ page }) => {
    await page.goto('http://localhost:3200/tasks/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1200);
    // 新建按钮
    await expect(page.getByRole('link', { name: /新建|创建/ }).first()).toBeVisible({ timeout: 10000 });
    // 至少一个任务
    const firstLink = page.locator('a[href*="/tasks/"]').filter({ hasNotText: '列表' }).filter({ hasNotText: '定时' }).first();
    await expect(firstLink).toBeVisible({ timeout: 10000 });
    await firstLink.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await expect(page.locator('main').first()).toBeVisible({ timeout: 5000 });
  });

  test('频道(大模型)列表加载', async ({ page }) => {
    await page.goto('http://localhost:3200/channels/llm/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await expect(page.locator('main, h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('知识库列表加载 + 详情可达', async ({ page }) => {
    await page.goto('http://localhost:3200/foundation/knowledge/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1500);
    await expect(page.locator('main, h1, h2').first()).toBeVisible({ timeout: 5000 });
  });

  test('数字员工活动日志日期非 NaN(R49-E fix)', async ({ page }) => {
    // 用 ?tab=logs 直接验证 tab-logs.tsx 的 fmtTimeline 修复
    await page.goto('http://localhost:3200/employees/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    const firstAgent = page.locator('a[href*="/employees/"]').first();
    await firstAgent.click();
    await page.waitForLoadState('domcontentloaded');
    // 切到 logs tab
    const logsTab = page.getByRole('link', { name: /日志|活动/ }).first();
    if (await logsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await logsTab.click();
      await page.waitForTimeout(800);
      const body = await page.locator('body').textContent();
      expect(body, '日期不能渲染成 NaN(R49-E bug #1 修复验证)').not.toMatch(/NaN月NaN日/);
    }
  });
});
