import { test, expect } from '@playwright/test';

test('full publish flow against sandbox', async ({ page }) => {
  // 1. 登录
  await page.goto('http://localhost:3737/login');
  await page.fill('#username', 'test');
  await page.fill('#password', 'pass');
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/dashboard/);

  // 2. 发布
  await page.goto('http://localhost:3737/products/new');
  await page.fill('input[name=title]', '井口装置 API 6A');
  await page.fill('textarea[name=description]', 'High quality wellhead...');
  await page.click('button[type=submit]');

  await expect(page.locator('h1')).toContainText('已发布: 井口装置 API 6A');
});
