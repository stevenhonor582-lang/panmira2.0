import { describe, it, expect, vi, afterAll } from 'vitest';

vi.mock('playwright', () => {
  const fakePage = {
    goto: vi.fn(async () => undefined),
    title: vi.fn(async () => 'Example Domain'),
    locator: vi.fn(() => ({
      first: () => ({
        click: vi.fn(async () => undefined),
        fill: vi.fn(async () => undefined),
        innerText: vi.fn(async () => 'mocked text'),
      }),
    })),
    screenshot: vi.fn(async () => Buffer.from('iVBORw0KGgo=', 'base64')),
    on: vi.fn(),
    close: vi.fn(async () => undefined),
  };
  const fakeContext = {
    newPage: vi.fn(async () => fakePage),
    close: vi.fn(async () => undefined),
  };
  const fakeBrowser = {
    newContext: vi.fn(async () => fakeContext),
    close: vi.fn(async () => undefined),
  };
  return {
    chromium: { launch: vi.fn(async () => fakeBrowser) },
  };
});

import { BrowserEngine } from '../browser-engine.js';

describe('BrowserEngine (mocked Playwright)', () => {
  const engine = new BrowserEngine();

  afterAll(async () => {
    await engine.shutdownAll();
  });

  it('launch returns a sessionId', async () => {
    const { sessionId } = await engine.launch('t1');
    expect(sessionId).toBeTruthy();
    await engine.close(sessionId);
  });

  it('navigate resolves when page loads (mocked title)', async () => {
    const { sessionId } = await engine.launch('t1');
    await engine.navigate(sessionId, 'https://example.com');
    const title = await engine.title(sessionId);
    expect(title).toContain('Example');
    await engine.close(sessionId);
  });

  it('close on unknown session does not throw', async () => {
    await expect(engine.close('nonexistent')).resolves.toBeUndefined();
  });
});
