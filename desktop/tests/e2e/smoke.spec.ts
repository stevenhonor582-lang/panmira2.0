import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('app boots', async () => {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--window-size=1280,800']
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  // Verifies window opens with a document. Real route testing deferred
  // to v0.2 when real content ships (placeholder pages have no router
  // navigation hooks).
  await expect(window.locator('#root')).toBeVisible();
  await app.close();
});
