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

// R53-T5: 招聘正规入口是 /employees/recruit?hrId=<uuid>。无 hrId 时 wizard 跳回 /hr。
const HR_ID = '0253fff5-5daf-42f4-8642-dd1f95251c53';

test('R15-B wizard: step 2 loads real providers + temperature explanation', async ({ page }) => {
  await page.goto(`http://localhost:3200/employees/recruit?hrId=${HR_ID}`);
  await expect(page.getByText('数字员工招聘')).toBeVisible({ timeout: 10000 });
  // R53: 招聘模式 step 1 = HR 预览(只读),无 name input,直接跳 step 2
  await jumpTo(page, '大脑模型');
  // Wait for parallel fetch to populate the dropdown
  await expect(page.getByText(/MiniMax|DeepSeek|智谱/).first()).toBeVisible({ timeout: 5000 });
  // temperature section present (subtitle is the stable copy)
  await expect(page.getByText(/越低越严谨,越高越发散/)).toBeVisible();
  // R34-B: context window section (auto-read from provider_configs) + auto-compress section
  await expect(page.getByText(/记忆容量 · 上下文窗口/).first()).toBeVisible();
  await expect(page.getByText('上下文自动压缩').first()).toBeVisible();
  // R51-B2: 启用/已关闭 toggle — 默认开启,所以看到"已启用"或 checkbox
  await expect(page.getByText(/已启用|启用自动压缩/).first()).toBeVisible();
  // No fake Cloud Sonic anywhere
  expect(await page.locator('body').textContent() || '').not.toContain('Cloud Sonic');
  // Real-time preview uses real data
  await expect(page.getByText(/实时名片 · 预览/)).toBeVisible();
});

test('R15-B wizard: step 4 skills + MCP loaded from real APIs', async ({ page }) => {
  await page.goto(`http://localhost:3200/employees/recruit?hrId=${HR_ID}`);
  await expect(page.getByText('数字员工招聘')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '能力装载');
  // R51: 技能 section 标题(三个独立 span: 技能 + 必选 + 来自技能库)
  await expect(page.getByRole('heading').filter({ hasText: '技能' }).first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('必选').first()).toBeVisible();
  await expect(page.getByText('来自技能库').first()).toBeVisible();
  // Search box present
  await expect(page.getByPlaceholder('搜索技能名 / 描述 / 标签...')).toBeVisible();
  // MCP section present (R51: renamed to 外接能力)
  await expect(page.getByRole('heading', { name: /外接能力/ })).toBeVisible();
  // Tools section (R51-B3: 内部工具 · 权限管理)
  await expect(page.getByRole('heading').filter({ hasText: '内部工具' }).first()).toBeVisible();
  await expect(page.getByText('权限管理').first()).toBeVisible();
});

test('R15-B wizard: step 6 channel binding + working dir', async ({ page }) => {
  await page.goto(`http://localhost:3200/employees/recruit?hrId=${HR_ID}`);
  await expect(page.getByText('数字员工招聘')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '协作配置');
  // R34-B: 频道→入口 rename
  await expect(page.getByRole('heading', { name: /入口绑定/ })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/一个员工可绑多个入口/)).toBeVisible();
  // R34-B: 工作目录系统生成 + 锁定(只读 input + 锁定 badge)
  await expect(page.getByLabel('工作目录(系统生成,只读)')).toBeVisible();
  await expect(page.getByText('锁定').first()).toBeVisible();
  // Visibility options
  await expect(page.getByText('私有')).toBeVisible();
  await expect(page.getByText('团队可见')).toBeVisible();
  await expect(page.getByText('公开')).toBeVisible();
});

test('R15-B wizard: step 7 is 发布 (not 测试上线)', async ({ page }) => {
  await page.goto(`http://localhost:3200/employees/recruit?hrId=${HR_ID}`);
  await expect(page.getByText('数字员工招聘')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '发布');
  await expect(page.getByText(/发布 · 配好就上线/)).toBeVisible({ timeout: 5000 });
  const body = await page.locator('body').textContent() || '';
  expect(body).not.toContain('沙盒测试');
  expect(body).not.toContain('三个测试用例');
});

test('R15-B wizard: step 5 KB three-layer + real folders', async ({ page }) => {
  await page.goto(`http://localhost:3200/employees/recruit?hrId=${HR_ID}`);
  await expect(page.getByText('数字员工招聘')).toBeVisible({ timeout: 10000 });
  await jumpTo(page, '记忆注入');
  await expect(page.getByText(/知识三层结构 · 自动注入/)).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/文件夹 · 组织公共区/)).toBeVisible();
  // The three layer chips — each appears in multiple places (chip + description), use first()
  await expect(page.getByText('短期记忆').first()).toBeVisible();
  await expect(page.getByText('长期事实').first()).toBeVisible();
  await expect(page.getByText('永久原则').first()).toBeVisible();
});
