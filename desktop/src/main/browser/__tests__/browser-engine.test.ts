import { describe, it, expect, afterAll } from 'vitest';
import { BrowserEngine } from '../browser-engine.js';

describe('BrowserEngine', () => {
  const engine = new BrowserEngine();

  afterAll(async () => {
    await engine.shutdownAll();
  });

  it('launch + close round-trip', async () => {
    const { sessionId } = await engine.launch('t1');
    expect(sessionId).toBeTruthy();
    await engine.close(sessionId);
  }, 30_000);

  it('navigate resolves when page loads', async () => {
    const { sessionId } = await engine.launch('t1');
    await engine.navigate(sessionId, 'https://example.com');
    const title = await engine.title(sessionId);
    expect(title).toContain('Example');
    await engine.close(sessionId);
  }, 30_000);

  it('close on unknown session does not throw', async () => {
    await expect(engine.close('nonexistent')).resolves.toBeUndefined();
  });
});
