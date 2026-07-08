import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

/**
 * Q3 · 系统级 33 页 E2E
 * 运行: npx playwright test e2e/specs/q3-33pages.spec.ts --reporter=list
 */

// 用 init script 注入 token,避免每次跑 login 触发 rate-limit
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
  // 直接注入 token 到 localStorage,跳过表单提交
  await page.addInitScript(({ token, user }) => {
    if (token) {
      localStorage.setItem('panmira.token', token);
      localStorage.setItem('panmira.user', JSON.stringify(user));
      localStorage.setItem('panmira.refresh', 'mock-refresh');
    }
  }, { token: ADMIN_TOKEN, user: ADMIN_USER });
  await page.goto('http://localhost:3200/overview/dashboard/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
}

async function resolveDynamicPaths(page: Page): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const fetchIds = async (path: string, key: string, idField = 'id') => {
    try {
      const items = await page.evaluate(async ({ p, f }) => {
        const t = localStorage.getItem('panmira.token');
        if (!t) return [];
        const r = await fetch(p, { headers: { Authorization: 'Bearer ' + t } });
        const d = await r.json().catch(() => null);
        if (!d) return [];
        const arr = Array.isArray(d) ? d : (d.items ?? d.agents ?? d.pipelines ?? d.data?.items ?? d.data ?? []);
        return Array.isArray(arr) ? arr : [];
      }, { p: path, f: idField });
      if (items.length && items[0]?.[idField]) out[key] = items[0][idField];
    } catch {}
  };
  await fetchIds('/api/v2/people', 'people');
  await fetchIds('/api/v2/admin/agents', 'agent');
  await fetchIds('/api/v2/admin/pipelines', 'task');
  return out;
}

const STATIC_PATHS = [
  '/login/',
  '/overview/dashboard/',
  '/overview/people/',
  '/overview/billing/',
  '/overview/diagnosis/',
  '/overview/optimization/',
  '/overview/logs/',
  '/employees/',
  '/employees/new/',
  '/employees/templates/',
  '/foundation/',
  '/foundation/memory/l1/',
  '/foundation/memory/l2/',
  '/foundation/memory/l3/',
  '/foundation/knowledge/',
  '/foundation/extraction/',
  '/foundation/feedback/',
  '/tasks/',
  '/tasks/new/',
  '/tasks/scheduled/',
  '/channels/',
  '/channels/llm/',
  '/channels/skills/',
  '/channels/mcp/',
  '/channels/endpoints/',
  '/channels/oauth/',
  '/channels/routing/',
  '/settings/permissions/',
  '/settings/voice/',
  '/settings/advanced/',
];

test.describe('Q3 · 33 页系统级 E2E', () => {
  let dynamicPaths: Record<string, string> = {};

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAdmin(page);
    dynamicPaths = await resolveDynamicPaths(page);
    await page.close();
    console.log('[Q3] 解析 dynamic IDs:', JSON.stringify(dynamicPaths));
  });

  test.beforeEach(async ({ page }) => {
    await loginAdmin(page);
  });

  test('01 login flow → dashboard', async ({ page }) => {
    // 用 init script 注入 token,所以直接访问 dashboard 就跳到工作台
    await page.goto('http://localhost:3200/');
    await expect(page).toHaveURL(/\/overview\/dashboard/, { timeout: 10000 });
  });

  for (const path of STATIC_PATHS) {
    test(`load static: ${path}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
      page.on('response', (r) => {
        if (r.status() >= 400 && r.status() !== 429 && !r.url().includes('favicon')) {
          errors.push(`http ${r.status()}: ${r.url()}`);
        }
      });
      await page.goto(`http://localhost:3200${path}`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(800);
      const main = page.locator('main, h1, h2').first();
      await expect(main, `页 ${path} 无可见主元素`).toBeVisible({ timeout: 5000 });
      expect(errors, errors.join('\n')).toHaveLength(0);
    });
  }

  test('load dynamic /overview/people/[id]', async ({ page }) => {
    const id = dynamicPaths['people'];
    if (!id) { test.skip(true, '无可用 person ID'); return; }
    const path = `/overview/people/${id}/`;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.status() !== 429 && !r.url().includes('favicon')) {
        errors.push(`http ${r.status()}: ${r.url()}`);
      }
    });
    await page.goto(`http://localhost:3200${path}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('load dynamic /employees/[id]', async ({ page }) => {
    const id = dynamicPaths['agent'];
    if (!id) { test.skip(true, '无可用 agent ID'); return; }
    const path = `/employees/${id}/`;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.status() !== 429 && !r.url().includes('favicon')) {
        errors.push(`http ${r.status()}: ${r.url()}`);
      }
    });
    await page.goto(`http://localhost:3200${path}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('load dynamic /tasks/[id]', async ({ page }) => {
    const id = dynamicPaths['task'];
    if (!id) { test.skip(true, '无可用 pipeline ID'); return; }
    const path = `/tasks/${id}/`;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`page: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.status() !== 429 && !r.url().includes('favicon')) {
        errors.push(`http ${r.status()}: ${r.url()}`);
      }
    });
    await page.goto(`http://localhost:3200${path}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(800);
    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});
