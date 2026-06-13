import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('playwright', () => {
  const fakePage = {
    goto: vi.fn(async () => undefined),
    title: vi.fn(async () => 'Example Domain'),
    locator: vi.fn(() => ({
      first: () => ({
        click: vi.fn(async () => undefined),
        fill: vi.fn(async () => undefined),
        innerText: vi.fn(async () => 'mocked heading text'),
      }),
    })),
    screenshot: vi.fn(async () => Buffer.from('iVBORw0KGgoAAAANSUhEUg==', 'base64')),
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
import { BrowserActions } from '../browser-actions.js';

describe('BrowserActions (mocked Playwright)', () => {
  let engine: BrowserEngine;
  let actions: BrowserActions;
  let sessionId: string;

  beforeAll(async () => {
    engine = new BrowserEngine();
    actions = new BrowserActions(engine);
    const launched = await engine.launch('test-task');
    sessionId = launched.sessionId;
    await engine.navigate(sessionId, 'https://example.com');
  });

  afterAll(async () => {
    await engine.shutdownAll();
  });

  it('screenshot returns base64 PNG string', async () => {
    const png = await actions.screenshot(sessionId);
    expect(typeof png).toBe('string');
    expect(png.length).toBeGreaterThan(0);
    expect(png).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('extract returns text from the page', async () => {
    const text = await actions.extract(sessionId, 'h1');
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('click does not throw', async () => {
    await expect(actions.click(sessionId, 'a')).resolves.toBeUndefined();
  });

  it('fill does not throw', async () => {
    await expect(actions.fill(sessionId, 'input', 'value')).resolves.toBeUndefined();
  });

  it('navigate (BrowserActions wrapper) does not throw', async () => {
    await expect(actions.navigate(sessionId, 'https://example.com')).resolves.toBeUndefined();
  });
});
