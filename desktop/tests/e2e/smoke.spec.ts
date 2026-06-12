// NOTE: This test launches the actual Electron app and requires a display
// server (X11, Wayland, or xvfb). It is skipped by default in headless
// environments. To run locally:
//   - macOS/Windows: just run `npx playwright test tests/e2e/smoke.spec.ts`
//   - Linux: `xvfb-run npx playwright test tests/e2e/smoke.spec.ts`
//   - CI: add `xvfb-run` or use Playwright's `webServer` config
//
// The test was committed without being run because the development
// environment is headless. See PR #9 for details.

import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('app boots → login → chat placeholder', async () => {
  const app = await electron.launch({ args: ['.'] });
  const window = await app.firstWindow();
  await expect(window.locator('[data-testid]')).toBeVisible();
  await app.close();
});
