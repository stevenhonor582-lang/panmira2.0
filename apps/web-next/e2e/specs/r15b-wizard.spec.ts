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

// Helper — jump to a step via the rail (rail buttons show step labels)
async function jumpTo(page: Page, stepLabel: string) {
  // Rail buttons contain the step label text — click the button whose accessible name matches.
  // The rail renders each step as a <button> with the label as the first text line.
  const railBtn = page.locator('nav[aria-label="wizard steps"] button', { hasText: stepLabel }).first();
  await railBtn.click();
  // Give the step content a tick to swap (the wizard keys the panel by step number)
  await page.waitForTimeout(150);
}

test('R15-B wizard: step 2 loads real providers + temperature explanation', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('例:不盈 / 墨言 / 守静 / 销售助手-A').fill('R15B 测试员工');
  // Step 2 — go via rail
  await jumpTo(page, '大脑模型');
  await expect(page.getByText('LLM 服务商')).toBeVisible({ timeout: 5000 });
  // Wait for parallel fetch to populate the dropdown
  await expect(page.getByText(/MiniMax|DeepSeek|智谱/).first()).toBeVisible({ timeout: 5000 });
  // temperature explanation
  await expect(page.getByText(/temperature = 模型选词时的/)).toBeVisible();
  await expect(page.getByText('越确定 ↔ 越随机')).toBeVisible();
  // No fake Cloud Sonic anywhere
  expect(await page.locator('body').textContent() || '').not.toContain('Cloud Sonic');
  // Real-time preview uses real data
  await expect(page.getByText('实时预览 · 真实数据')).toBeVisible();
});

test('R15-B wizard: step 4 skills + MCP loaded from real APIs', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '能力装载');
  await expect(page.getByText(/Skills · 技能 · 来自 \/api\/skills/)).toBeVisible({ timeout: 5000 });
  // Search box present
  await expect(page.getByPlaceholder('搜索技能名 / 描述 / 标签...')).toBeVisible();
  // MCP section present
  await expect(page.getByText(/MCP Servers · 来自 \/api\/mcp\/servers/)).toBeVisible();
  // Tools section
  await expect(page.getByText(/Tools · 内置工具/)).toBeVisible();
});

test('R15-B wizard: step 6 channel binding + working dir', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '协作配置');
  await expect(page.getByText(/频道绑定/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/一个员工可绑多个 bot/)).toBeVisible();
  // Working directory input present
  await expect(page.getByPlaceholder('/workspace/agents/<员工名>')).toBeVisible();
  // Visibility options
  await expect(page.getByText('私有')).toBeVisible();
  await expect(page.getByText('团队可见')).toBeVisible();
  await expect(page.getByText('公开')).toBeVisible();
});

test('R15-B wizard: step 7 is 发布 (not 测试上线)', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '发布');
  await expect(page.getByText(/发布 · 配好就上线/)).toBeVisible({ timeout: 5000 });
  const body = await page.locator('body').textContent() || '';
  expect(body).not.toContain('沙盒测试');
  expect(body).not.toContain('三个测试用例');
});

test('R15-B wizard: step 5 KB three-layer + real folders', async ({ page }) => {
  await page.goto('http://localhost:3200/employees/new/');
  await expect(page.getByText('创建新的数字员工')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '知识注入');
  await expect(page.getByText(/知识三层结构 · 公共记忆/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/文件夹 · 来自 \/api\/knowledge\/folders/)).toBeVisible();
  // The three layer chips
  await expect(page.getByText('短期记忆')).toBeVisible();
  await expect(page.getByText('长期事实')).toBeVisible();
  await expect(page.getByText('永久原则')).toBeVisible();
});
