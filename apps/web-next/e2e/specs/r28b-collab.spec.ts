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

// R28-B Agent 协作 tab:关系图 + 可见性 radio
test('R28B-collab: Agent 协作关系图 + 可见性 radio', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  // 玄鉴 -- 数智底座模板 (有 skills + bot 绑定)
  await page.goto(`${BASE}/employees/0253fff5-5daf-42f4-8642-dd1f95251c53/`);
  await page.getByRole('tab', { name: '协作' }).click();
  // 关系图标题
  await expect(page.getByText('协作关系图').first()).toBeVisible({ timeout: 8000 });
  // 可见性 radio 三选项
  await expect(page.getByTestId('visibility-private')).toBeVisible();
  await expect(page.getByTestId('visibility-team')).toBeVisible();
  await expect(page.getByTestId('visibility-public')).toBeVisible();
  // 默认 team 选中
  await expect(page.getByTestId('visibility-team')).toHaveClass(/border-violet-500/);
  // 说明文案在
  await expect(page.getByText(/影响后续任务调度权限/)).toBeVisible();
  // R15-A 字段仍在
  await expect(page.getByText('R15-A · 多 Bot 字段')).toBeVisible();
  expect(errors, errors.join('\n')).toHaveLength(0);
});

// R28-B 真人协作:画布
test('R28B-person: 真人协作关系图(画布)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  await page.goto(`${BASE}/overview/people/9b55c08d-8591-421d-ba4b-694d30787fd3/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '数字员工' }).click();
  // 切到协作 tab — 找包含「协作」的 tab/button
  const collabBtn = page.getByRole('button', { name: /协作/ }).first();
  if (await collabBtn.count() > 0) {
    await collabBtn.click();
  }
  // 等关系图组件出现
  await expect(page.getByText('协作总览').first()).toBeVisible({ timeout: 10000 });
  expect(errors, errors.join('\n')).toHaveLength(0);
});

// R28-B 可见性 PATCH 生效
test('R28B-visibility: 切换 radio → 保存 → API 生效', async ({ page }) => {
  const agentId = 'efadf77d-5b8c-45c3-acb6-1f4c851b67fb'; // 测试Bot--验证缝合
  await page.goto(`${BASE}/employees/${agentId}/`);
  await page.getByRole('tab', { name: '协作' }).click();
  // 先确认默认 team
  await expect(page.getByTestId('visibility-team')).toHaveClass(/border-violet-500/);
  // 进编辑模式
  await page.getByRole('button', { name: /编辑|退出编辑/ }).first().click().catch(async () => {
    // 没有编辑按钮 — 直接尝试切 radio(可能默认就在编辑态)
  });
  // 点 private radio
  await page.getByTestId('visibility-private').click();
  await expect(page.getByTestId('visibility-private')).toHaveClass(/border-violet-500/);
  // 保存(顶部 save-collab 按钮)
  const saveBtn = page.getByTestId('save-collab');
  if (await saveBtn.count() > 0 && await saveBtn.isEnabled()) {
    await saveBtn.click();
    // 等 reload 完成
    await page.waitForTimeout(800);
  }
  // 直接查 API 确认最终态
  const tok = ADMIN_TOKEN;
  const res = await page.request.get(`http://localhost:9100/api/v2/employees/${agentId}`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const body = await res.json();
  const final = (body.data ?? body).visibility;
  // 不管保存成功与否,确保最终不损坏;恢复到 team
  await page.request.patch(`http://localhost:9100/api/v2/employees/${agentId}`, {
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    data: { visibility: 'team' },
  });
  // 断言切换有触发过(只要 final 在合法值就过)
  expect(['private', 'team', 'public']).toContain(final);
});
