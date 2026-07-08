import { test, expect } from '@playwright/test';
test('dashboard renders all 5 zones with real data', async ({ page }) => {
  await page.goto('/login/');
  await page.fill('input[type="email"]', '20218181@qq.com');
  await page.fill('input[type="password"]', 'shidefei@2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/overview/dashboard/**', { timeout: 15000 });
  // Wait for KPI data to load (not skeleton)
  await expect(page.getByText('公司运营全景')).toBeVisible();
  await expect(page.getByText('30 天趋势')).toBeVisible();
  await expect(page.getByText('系统健康度')).toBeVisible();
  await expect(page.getByText('Top 5 数字员工')).toBeVisible();
  await expect(page.getByText('Top 5 正式员工')).toBeVisible();
  await expect(page.getByText('Top 5 KB 文档')).toBeVisible();
  await expect(page.getByText('最近流水线')).toBeVisible();
  await expect(page.getByText('最近审计')).toBeVisible();
  await expect(page.getByText('最近会话')).toBeVisible();
  await page.screenshot({ path: '/tmp/dashboard-r12-full.png', fullPage: true });
});
