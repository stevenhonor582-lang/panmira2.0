import { test, expect, type Page } from '@playwright/test';
import * as fs from 'node:fs';

const ADMIN_TOKEN = fs.existsSync('/tmp/admin_token.txt')
  ? fs.readFileSync('/tmp/admin_token.txt', 'utf8').replace('TOKEN=', '').trim()
  : '';

const ADMIN_USER = {
  id: '9b55c08d-8591-421d-ba4b-694d30787fd3',
  email: '20218181@qq.com',
  name: '史德飞',
  role: 'admin',
  tenantId: '491c000f-7e34-4a6e-a561-d8a948c6e429',
};

async function loginAdmin(page: Page) {
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem('panmira.token', token);
      localStorage.setItem('panmira.user', JSON.stringify(user));
      localStorage.setItem('panmira.refresh', 'mock-refresh');
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
}

test.describe('R14-E 诊断 + 优化合并', () => {
  test('诊断页: 综合分 + 5 项 + 时间戳 + 优化建议 + sidebar 已删 optimization', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('http://localhost:3200/overview/diagnosis/', { waitUntil: 'domcontentloaded' });

    // 等待 client 加载完毕
    await expect(page.getByText('综合健康分').first()).toBeVisible({ timeout: 20000 });

    // 1) 综合健康分卡片 + 标题
    await expect(page.getByRole('heading', { name: '系统诊断' })).toBeVisible();
    await expect(page.getByText(/诊断于/)).toBeVisible();
    await expect(page.getByText(/下次自动诊断/)).toBeVisible();
    await expect(page.getByRole('button', { name: /立即诊断|诊断中/ })).toBeVisible();

    // 2) 5 项核心健康
    await expect(page.getByText('核心功能健康度').first()).toBeVisible();
    for (const name of ['系统服务', 'AI 大模型', '知识库检索', '任务执行', '资源']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }

    // 3) 优化建议并入
    await expect(page.getByText('优化建议').first()).toBeVisible();

    // 4) sidebar: 诊断在,优化不在
    await expect(page.locator('a[href*="/overview/diagnosis"]').first()).toBeVisible();
    await expect(page.locator('a[href*="/overview/optimization"]')).toHaveCount(0);

    await page.screenshot({ path: '/tmp/r14e-diagnosis.png', fullPage: true });
  });

  test('/overview/optimization 重定向到 /overview/diagnosis', async ({ page }) => {
    await loginAdmin(page);
    await page.goto('http://localhost:3200/overview/optimization/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/overview\/diagnosis/);
    await expect(page.getByText('综合健康分').first()).toBeVisible({ timeout: 20000 });
  });
});
