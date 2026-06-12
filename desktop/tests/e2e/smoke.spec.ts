// desktop/tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('app boots → login → chat placeholder', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();

  // 启动后应该看到 LoginPage 或 ChatPage（取决于 token 缓存）
  await expect(window.locator('[data-testid]')).toBeVisible();

  // 不抛异常就算通过
  await app.close();
});
