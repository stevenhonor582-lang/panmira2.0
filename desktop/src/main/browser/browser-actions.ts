import type { BrowserEngine } from './browser-engine.js';
import type { SessionId } from './session-store.js';

export class BrowserActions {
  constructor(private engine: BrowserEngine) {}

  private getPage(sessionId: SessionId) {
    return this.engine.getPage(sessionId);
  }

  async navigate(sessionId: SessionId, url: string): Promise<void> {
    const page = this.getPage(sessionId);
    await page.goto(url, { timeout: 30_000 });
  }

  async screenshot(sessionId: SessionId): Promise<string> {
    const page = this.getPage(sessionId);
    const buffer = await page.screenshot({ type: 'png' });
    return buffer.toString('base64');
  }

  async click(sessionId: SessionId, selector: string): Promise<void> {
    const page = this.getPage(sessionId);
    await page.locator(selector).first().click({ timeout: 10_000 });
  }

  async fill(sessionId: SessionId, selector: string, text: string): Promise<void> {
    const page = this.getPage(sessionId);
    await page.locator(selector).first().fill(text, { timeout: 10_000 });
  }

  async extract(sessionId: SessionId, selector: string): Promise<string> {
    const page = this.getPage(sessionId);
    return page.locator(selector).first().innerText({ timeout: 10_000 });
  }
}
