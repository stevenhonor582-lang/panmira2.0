import { chromium, type Page } from 'playwright';

export interface LoginParams {
  loginUrl: string;
  username: string;
  password: string;
  usernameSelector: string;
  passwordSelector: string;
  submitSelector: string;
  successUrlPattern?: string;
}

export async function performLogin(params: LoginParams): Promise<{ page: Page }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(params.loginUrl);
    await page.fill(params.usernameSelector, params.username);
    await page.fill(params.passwordSelector, params.password);
    await page.click(params.submitSelector);
    if (params.successUrlPattern) {
      await page.waitForURL(params.successUrlPattern, { timeout: 30_000 });
    }
    return { page };
  } finally {
    await browser.close();
  }
}
