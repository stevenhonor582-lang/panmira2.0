import { test, expect } from '@playwright/test';

test('R14-A dashboard renders all zones with real data + new bottom 3 columns', async ({ page }) => {
  await page.goto('/login/');
  await page.fill('input[type="email"]', '20218181@qq.com');
  await page.fill('input[type="password"]', 'shidefei@2026');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/overview/dashboard/**', { timeout: 15000 });

  // Header
  await expect(page.getByText('公司运营全景')).toBeVisible();
  await expect(page.getByText('数据更新于')).toBeVisible();
  await expect(page.getByText('每分钟自动刷新')).toBeVisible();

  // Trend + Health (6 new health items, distinct from KPI labels)
  await expect(page.getByText('30 天趋势')).toBeVisible();
  await expect(page.getByText('系统健康度')).toBeVisible();
  await expect(page.getByText('系统服务').first()).toBeVisible();
  await expect(page.getByText('AI 大模型').first()).toBeVisible();
  await expect(page.getByText('知识库检索').first()).toBeVisible();
  await expect(page.getByText('任务执行').first()).toBeVisible();
  await expect(page.getByText('正式员工活跃').first()).toBeVisible();

  // Top 5 三列
  await expect(page.getByRole('heading', { name: 'Top 5 数字员工' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top 5 正式员工' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Top 5 KB 文档' })).toBeVisible();

  // R14-A 底部 3 列 (新)
  await expect(page.getByRole('heading', { name: '今日待办' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '需要关注' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '最近完成' })).toBeVisible();

  // 拒绝出现 R12 旧文案 (这些应该在 R14-A 已被移除)
  await expect(page.getByText('Memory 三层')).toHaveCount(0);
  await expect(page.getByText('缓存命中率')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '最近流水线' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '最近审计' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '最近会话' })).toHaveCount(0);

  await page.screenshot({ path: '/tmp/dashboard-r14a-full.png', fullPage: true });
});
