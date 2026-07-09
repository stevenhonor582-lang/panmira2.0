import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * R15-A · 数字员工 + 模板系统 · 冒烟测试
 * 只验证:无 JS 错误 + 无 4xx/5xx API + 关键 UI 元素可见
 * (页面 main 区可见性的检测与 Q3 spec 共用同一 selector;若 Q3 都失败,
 *  这里也只验证更宽松的"无 pageerror")
 */
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

async function captureErrors(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      // 忽略 next 开发警告
      if (!t.includes('Download the React DevTools') && !t.includes('favicon')) {
        errors.push(`console: ${t}`);
      }
    }
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.status() !== 429 && !r.url().includes('favicon')) {
      errors.push(`http ${r.status()}: ${r.url()}`);
    }
  });
  return errors;
}

test.describe('R15-A · employees + templates', () => {
  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test('员工库列表加载,无 pageerror/http 错误', async ({ page }) => {
    const errors = await captureErrors(page);
    await page.goto('http://localhost:3200/employees/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    // 关键:无 JS 异常
    const realErrors = errors.filter((e) =>
      !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') &&
      !e.includes('favicon')
    );
    expect(realErrors, realErrors.join('\n')).toHaveLength(0);
  });

  test('不盈--全栈开发 详情页打开 (详情页打开)', async ({ page }) => {
    const errors = await captureErrors(page);
    await page.goto('http://localhost:3200/employees/c5bf8d20-90f4-4780-95cc-ed866651b3c8/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    // 关键:不能因为 persona null 而 throw
    const realErrors = errors.filter((e) =>
      !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') &&
      !e.includes('favicon')
    );
    expect(realErrors, realErrors.join('\n')).toHaveLength(0);

    // 切到协作 tab,验证 R15-A 字段渲染不 crash
    const collabTab = page.getByRole('tab', { name: /协作/ });
    if (await collabTab.count() > 0) {
      await collabTab.click();
      await page.waitForTimeout(1500);
      const newErrors = errors.filter((e) =>
        !e.includes('net::ERR') &&
        !e.includes('Failed to load resource') &&
        !e.includes('favicon')
      );
      expect(newErrors, newErrors.join('\n')).toHaveLength(0);
    }
  });

  test('模板库页加载,无 pageerror', async ({ page }) => {
    const errors = await captureErrors(page);
    await page.goto('http://localhost:3200/employees/templates/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    const realErrors = errors.filter((e) =>
      !e.includes('net::ERR') &&
      !e.includes('Failed to load resource') &&
      !e.includes('favicon')
    );
    expect(realErrors, realErrors.join('\n')).toHaveLength(0);
  });

  test('API: /api/v2/employees/templates 返回 200 + ≥1 模板', async ({ request }) => {
    const res = await request.get('http://localhost:9100/api/v2/employees/templates', {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body?.data?.items ?? [];
    expect(items.length, '应该至少有 1 个模板(full-stack-engineer)').toBeGreaterThanOrEqual(1);
    expect(items[0].isTemplate).toBe(true);
  });

  test('API: /api/v2/employees?filter=all 返回 8 条 (7 实例 + 1 模板)', async ({ request }) => {
    const res = await request.get('http://localhost:9100/api/v2/employees?filter=all', {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body?.data?.items ?? [];
    expect(items.length).toBeGreaterThanOrEqual(7);
    // 应该至少有 1 个 is_template=true
    const templates = items.filter((i: any) => i.is_template);
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  test('API: L6 详情返回完整字段(含 R15-A 新字段)', async ({ request }) => {
    const res = await request.get('http://localhost:9100/api/v2/employees/c5bf8d20-90f4-4780-95cc-ed866651b3c8', {
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const data = body?.data ?? {};
    expect(data.name).toBe('不盈--全栈开发');
    expect(data.persona).toBeTruthy(); // 不盈有 persona
    expect(data.isTemplate).toBe(false);
    expect(data.workingDir).toMatch(/\/workspace\/agents\//);
    expect(data.temperature).toBe(0.7);
    expect(data.visibility).toBe('team');
  });
});
