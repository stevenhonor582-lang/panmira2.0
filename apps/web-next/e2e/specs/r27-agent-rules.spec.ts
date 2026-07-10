import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const BASE = 'http://localhost:3200';
const ADMIN_TOKEN = fs.existsSync('/tmp/admin_token.txt')
  ? fs.readFileSync('/tmp/admin_token.txt', 'utf8').replace('TOKEN=', '').trim()
  : '';
const ADMIN_USER = {
  id: '9b55c08d-8591-421d-ba4b-694d30787fd3', email: '20218181@qq.com',
  name: '史德飞', role: 'admin', tenantId: '491c000f-7e34-4a6e-a561-d8a948c6e429',
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem('panmira.token', token);
      localStorage.setItem('panmira.user', JSON.stringify(user));
      localStorage.setItem('panmira.refresh', 'mock-refresh');
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
});

test('R27-collab: 员工详情协作 tab 加载 + 工作目录只读', async ({ page }) => {
  // 2026-07-11 R50-2: 协作 tab 内"运行参数(只读)"区(原"R15-A · 多 Bot 字段"块改名为运行参数);
  // 工作目录 row label 由 "工作目录 · working_dir" 改为 "工作目录 · 系统生成"。
  await page.goto(`${BASE}/employees/1634063d-5862-4230-93d3-1aa166ba0a1c/`);
  await page.getByRole('tab', { name: '协作' }).click();
  await expect(page.getByText('运行参数(只读)')).toBeVisible({ timeout: 8000 });
  await expect(page.getByText('工作目录 · 系统生成')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('只读').first()).toBeVisible();
});

test('R27-person: 真人详情 数字员工 tab 加载', async ({ page }) => {
  await page.goto(`${BASE}/overview/people/9b55c08d-8591-421d-ba4b-694d30787fd3/`, { waitUntil: 'networkidle' });
  // 等页面外壳加载
  await expect(page.getByRole('button', { name: '数字员工' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: '数字员工' }).click();
  await expect(page.getByText(/可调度|尚未关联|添加数字员工/).first()).toBeVisible({ timeout: 10000 });
});

test('R27-wizard: step1 工作目录自动预览', async ({ page }) => {
  await page.goto(`${BASE}/employees/new/`);
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('例:不盈 / 墨言 / 守静 / 销售助手-A').fill('守静测试');
  await expect(page.getByText(/自动生成/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/sj/)).toBeVisible();
});
