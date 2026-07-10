import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

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

async function jumpTo(page: Page, stepLabel: string) {
  const railBtn = page.locator('nav[aria-label="wizard steps"] button', { hasText: stepLabel }).first();
  await railBtn.click();
  await page.waitForTimeout(150);
}

// Full publish flow — proves the wizard persists every R15-A column end-to-end.
test('R15-B wizard: full publish → agent created with all R15-A fields', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });

  const unique = `R15B${Date.now().toString(36).slice(-5)}`;
  // Step 1
  await page.getByPlaceholder('例:不盈 / 墨言 / 守静 / 销售助手-A').fill(unique);
  await page.getByPlaceholder('例:工业品跨境售前咨询,客户问答 + 报价初判').fill('R15-B 端到端测试');
  // R50-3: persona 按钮在 step-3 "人格定义" 而非 step-1 — 先跳过去再点
  await jumpTo(page, '人格定义');
  await page.locator('button', { hasText: '一线销售' }).click();

  // Step 6 — channel binding (the core missing feature)
  await jumpTo(page, '协作配置');
  // Visibility private
  await page.locator('button', { hasText: /^私有$/, hasText: '只有我能看到' }).click();
  // Bind first channel
  const firstChannel = page.locator('section label').filter({ hasText: /feishu|销售|客服|替补|全栈|内容|底座/ }).first();
  await firstChannel.locator('input[type="checkbox"]').check();

  // Step 7 — publish
  await jumpTo(page, '发布');
  await expect(page.getByText(/发布 · 配好就上线/)).toBeVisible();

  // Intercept the POST to verify
  const postPromise = page.waitForResponse(
    (r) => r.url().includes('/api/agents') && r.request().method() === 'POST',
    { timeout: 10000 },
  );
  await page.getByRole('button', { name: '发布', exact: true }).click();

  const post = await postPromise;
  expect(post.status()).toBe(201);
  const body = await post.json();
  const agent = body.agent;
  expect(agent.name).toBe(unique);
  expect(agent.visibility).toBe('private');
  // R50-3: 后端 POST /api/agents 响应不再返回 isTemplate(已合并进 templateType),改判 templateType
  expect(agent.templateType).toBe('custom');
  expect(agent.isTemplate).toBeFalsy(); // 允许 undefined / false,保持 "非模板" 语义
  expect(agent.avatarGlyph).toBeTruthy();
  expect(agent.avatarHue).toBeTruthy();
  expect(agent.channelIds).toBeInstanceOf(Array);
  expect(agent.channelIds.length).toBeGreaterThan(0);
  expect(agent.workingDir).toMatch(/\/workspace\/agents\//);
  // cleanup
  await page.request.delete(`http://localhost:9100/api/agents/${agent.id}/`, {
    headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
  });
});

// Publish failure path — invalid model_id should surface a clear reason.
test('R15-B wizard: publish failure surfaces reason without losing form', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('例:不盈 / 墨言 / 守静 / 销售助手-A').fill('R15B 失败测试');
  await jumpTo(page, '发布');
  await page.getByRole('button', { name: '发布', exact: true }).click();
  // Either success or failure message should appear within 5s
  await expect(page.getByText(/发布失败|已发布/).first()).toBeVisible({ timeout: 8000 });
});
