import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { BrowserEngine } from '../browser-engine.js';
import { BrowserActions } from '../browser-actions.js';

describe('BrowserActions', () => {
  let engine: BrowserEngine;
  let actions: BrowserActions;
  let sessionId: string;

  beforeAll(async () => {
    engine = new BrowserEngine();
    actions = new BrowserActions(engine);
    const launched = await engine.launch('test-task');
    sessionId = launched.sessionId;
    await engine.navigate(sessionId, 'https://example.com');
  }, 60_000);

  afterAll(async () => {
    await engine.shutdownAll();
  });

  it('screenshot returns base64 PNG string', async () => {
    const png = await actions.screenshot(sessionId);
    expect(typeof png).toBe('string');
    expect(png.length).toBeGreaterThan(100);
    expect(png.slice(0, 20)).toMatch(/^[A-Za-z0-9+/]+=*$/);
  }, 30_000);

  it('extract returns text from the page', async () => {
    const text = await actions.extract(sessionId, 'h1');
    expect(text).toContain('Example');
  }, 30_000);
});
