// NOTE: This test requires a display server. On headless environments,
// use `xvfb-run npx playwright test --update-snapshots tests/visual/` to
// generate the baseline `__snapshots__/login.png` first, then re-run
// without `--update-snapshots` for regression comparison.
//
// The baseline is NOT committed yet because the dev environment (mah)
// is headless. See PR #9.

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('login page visual', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await window.goto('app://./login');
  await expect(window).toHaveScreenshot('login.png', { maxDiffPixelRatio: 0.02 });
  await app.close();
});
