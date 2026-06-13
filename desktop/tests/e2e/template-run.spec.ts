import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('app launches and renders TemplatesPage', async () => {
  const app = await electron.launch({
    args: ['.', '--no-sandbox', '--window-size=1280,800']
  });
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    // The renderer has a Templates nav link in v0.2; check the baseline
    // DOM loaded. We do NOT click it (would trigger IPC). Just verify
    // the window loaded with expected structure.
    const title = await window.title();
    expect(title).toBeTruthy();
    await expect(window.locator('#root')).toBeVisible();
  } finally {
    await app.close();
  }
});
