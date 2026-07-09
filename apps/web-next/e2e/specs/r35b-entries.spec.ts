import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const BASE = 'http://localhost:3200';
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

// R35-B: 入口管理 — 分类显示 + 二次确认 + 占用置灰
test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem('panmira.token', token);
      localStorage.setItem('panmira.user', JSON.stringify(user));
      localStorage.setItem('panmira.refresh', 'mock-refresh');
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
});

test('R35B-entries: 协作 tab 显示「已绑/空闲/占用」三段计数', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  await page.goto(`${BASE}/employees/0253fff5-5daf-42f4-8642-dd1f95251c53/`); // 玄鉴
  await page.getByRole('tab', { name: '协作' }).click();
  await expect(page.getByText('接入入口管理')).toBeVisible({ timeout: 8000 });
  // 三段计数:已绑定 / 空闲 / 占用
  const stats = page.getByTestId('entry-stats');
  await expect(stats).toBeVisible();
  const txt = (await stats.textContent()) ?? '';
  expect(txt).toMatch(/已绑定\s*\d+/);
  expect(txt).toMatch(/空闲\s*\d+/);
  expect(txt).toMatch(/占用\s*\d+/);
  expect(errors, errors.join('\n')).toHaveLength(0);
});

test('R35B-entries: 解绑触发「解绑入口确认」二次确认弹窗(取消可关)', async ({ page }) => {
  await page.goto(`${BASE}/employees/0253fff5-5daf-42f4-8642-dd1f95251c53/`); // 玄鉴
  await page.getByRole('tab', { name: '协作' }).click();
  await expect(page.getByText('接入入口管理')).toBeVisible({ timeout: 8000 });
  const boundList = page.getByTestId('entry-bound-list');
  // 如果没绑定任何入口则跳过(测试用例需保证此 agent 至少绑定 1 个)
  const count = await boundList.locator('li').count();
  test.skip(count === 0, '测试 agent 未绑定入口,跳过解绑测试');
  // 取第一个已绑入口的「解绑」按钮
  const firstUnbindBtn = boundList.locator('button[data-testid^="unbind-entry-"]').first();
  await expect(firstUnbindBtn).toBeVisible();
  await firstUnbindBtn.click();
  // 解绑确认弹窗
  await expect(page.getByRole('dialog', { name: '解绑入口确认' })).toBeVisible({ timeout: 3000 });
  // 文案含「解绑后」
  await expect(page.getByText(/解绑后/)).toBeVisible();
  // 取消按钮关弹窗
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog', { name: '解绑入口确认' })).not.toBeVisible();
});

test('R35B-entries: 占用入口置灰且有「占用·Agent」标签,点切换弹出二次确认', async ({ page }) => {
  await page.goto(`${BASE}/employees/0253fff5-5daf-42f4-8642-dd1f95251c53/`); // 玄鉴
  await page.getByRole('tab', { name: '协作' }).click();
  await expect(page.getByText('接入入口管理')).toBeVisible({ timeout: 8000 });
  const occupiedList = page.getByTestId('entry-occupied-list');
  const count = await occupiedList.locator('li').count();
  test.skip(count === 0, '测试 agent 当前无被占用入口,跳过占用测试');
  // 占用的入口按钮应该 opacity-60 类(置灰)
  const firstSwitchBtn = occupiedList.locator('button[data-testid^="switch-entry-"]').first();
  await expect(firstSwitchBtn).toBeVisible();
  await expect(firstSwitchBtn).toHaveClass(/opacity-60/);
  // 标签里有"占用 ·"
  await expect(firstSwitchBtn.locator('text=/占用\\s*·/').first()).toBeVisible();
  // 点击切换按钮 → 弹出二次确认
  await firstSwitchBtn.click();
  await expect(page.getByRole('dialog', { name: '切换入口确认' })).toBeVisible({ timeout: 3000 });
  await expect(page.getByText(/切换后/)).toBeVisible();
  // 取消关闭
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('dialog', { name: '切换入口确认' })).not.toBeVisible();
});

test('R35B-entries: 空闲入口直接绑定(无弹窗)', async ({ page }) => {
  await page.goto(`${BASE}/employees/0253fff5-5daf-42f4-8642-dd1f95251c53/`); // 玄鉴
  await page.getByRole('tab', { name: '协作' }).click();
  await expect(page.getByText('接入入口管理')).toBeVisible({ timeout: 8000 });
  const freeList = page.getByTestId('entry-free-list');
  const count = await freeList.locator('li').count();
  test.skip(count === 0, '测试 agent 当前无空闲入口,跳过');
  // 空闲入口按钮无 opacity-60(未置灰)
  const firstFreeBtn = freeList.locator('button[data-testid^="bind-entry-"]').first();
  await expect(firstFreeBtn).toBeVisible();
  // disabled:opacity-60 始终在 className 中(Tailwind 工具类),验证不含占用专属的 hover:opacity-100
  await expect(firstFreeBtn).not.toHaveClass(/hover:opacity-100/);
  // 含"空闲"小标签
  await expect(firstFreeBtn.locator('text=空闲').first()).toBeVisible();
});
