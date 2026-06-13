import { chromium, type BrowserContext, type Page } from 'playwright';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { SessionStore, type SessionId } from './session-store.js';

interface ManagedSession {
  context: BrowserContext;
  page: Page;
}

export class BrowserEngine {
  private store = new SessionStore();
  private managed = new Map<SessionId, ManagedSession>();
  private browserPromise?: Promise<import('playwright').Browser>;

  private async getBrowser(): Promise<import('playwright').Browser> {
    if (!this.browserPromise) {
      this.browserPromise = chromium.launch({ headless: true });
    }
    return this.browserPromise;
  }

  async launch(taskId: string): Promise<{ sessionId: SessionId }> {
    const browser = await this.getBrowser();
    const profileDir = join(
      tmpdir(),
      `panmira-profile-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );
    mkdirSync(profileDir, { recursive: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = this.store.create(taskId, {
      profileDir,
      launchedAt: Date.now(),
    });
    this.managed.set(session.sessionId, { context, page });
    return { sessionId: session.sessionId };
  }

  getPage(sessionId: SessionId): Page {
    const m = this.managed.get(sessionId);
    if (!m) throw new Error(`Unknown session: ${sessionId}`);
    return m.page;
  }

  async navigate(sessionId: SessionId, url: string): Promise<void> {
    const page = this.getPage(sessionId);
    await page.goto(url, { timeout: 30_000 });
  }

  async title(sessionId: SessionId): Promise<string> {
    return this.getPage(sessionId).title();
  }

  async close(sessionId: SessionId): Promise<void> {
    const m = this.managed.get(sessionId);
    if (!m) return;
    try {
      await m.context.close();
    } catch {
      // ignore
    }
    this.managed.delete(sessionId);
    this.store.remove(sessionId);
  }

  async shutdownAll(): Promise<void> {
    for (const id of Array.from(this.managed.keys())) {
      await this.close(id);
    }
    if (this.browserPromise) {
      const b = await this.browserPromise;
      await b.close();
      this.browserPromise = undefined;
    }
  }
}
