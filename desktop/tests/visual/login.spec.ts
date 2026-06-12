import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('login page visual', async () => {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--window-size=1280,800']
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // 0.1 (10%) tolerance accommodates Linux window-chrome variance
  // and rendering non-determinism on placeholder pages. For real
  // content (Week 2+), tighten to 0.02.
  await expect(window).toHaveScreenshot('login.png', { maxDiffPixelRatio: 0.1 });
  await app.close();
});
