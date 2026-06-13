import { describe, it, expect, vi } from 'vitest';
import { buildApiSurface } from '../context-bridge';

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn() }
}));

import { ipcRenderer } from 'electron';

describe('context-bridge api surface', () => {
  it('exposes only the whitelisted namespaces', () => {
    const surface = buildApiSurface();
    expect(Object.keys(surface).sort()).toEqual(['agent', 'auth', 'browser', 'kb', 'kbSearch', 'templates']);
  });

  it('each namespace is a function group, not raw ipcRenderer', () => {
    const surface = buildApiSurface();
    expect(typeof surface.auth).toBe('object');
    expect(typeof surface.auth.login).toBe('function');
  });

  it('browser namespace includes v0.1 publish and v0.2 open/screenshot/click/fill/extract/close', () => {
    const surface = buildApiSurface();
    expect(typeof surface.browser.publish).toBe('function');
    expect(typeof surface.browser.open).toBe('function');
    expect(typeof surface.browser.screenshot).toBe('function');
    expect(typeof surface.browser.click).toBe('function');
    expect(typeof surface.browser.fill).toBe('function');
    expect(typeof surface.browser.extract).toBe('function');
    expect(typeof surface.browser.close).toBe('function');
  });

  it('browser.open invokes the browser:open channel with taskId and url', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ viewportId: 'vp-1' });
    const surface = buildApiSurface();
    await surface.browser.open('task-42', 'https://example.com');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:open', 'task-42', 'https://example.com');
  });

  it('browser.screenshot invokes browser:screenshot with viewportId', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue('base64png');
    const surface = buildApiSurface();
    await surface.browser.screenshot('vp-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:screenshot', 'vp-1');
  });

  it('browser.click invokes browser:click with viewportId and selector', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const surface = buildApiSurface();
    await surface.browser.click('vp-1', '#submit');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:click', 'vp-1', '#submit');
  });

  it('browser.fill invokes browser:fill with viewportId, selector, and text', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const surface = buildApiSurface();
    await surface.browser.fill('vp-1', '#email', 'a@b.com');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:fill', 'vp-1', '#email', 'a@b.com');
  });

  it('browser.extract invokes browser:extract with viewportId and selector', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue('extracted-text');
    const surface = buildApiSurface();
    await surface.browser.extract('vp-1', 'h1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:extract', 'vp-1', 'h1');
  });

  it('browser.close invokes browser:close with viewportId', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const surface = buildApiSurface();
    await surface.browser.close('vp-1');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('browser:close', 'vp-1');
  });

  it('templates namespace exposes run and list', () => {
    const surface = buildApiSurface();
    expect(typeof surface.templates).toBe('object');
    expect(typeof surface.templates.run).toBe('function');
    expect(typeof surface.templates.list).toBe('function');
  });

  it('templates.run invokes templates:run with templateId and params', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({ taskId: 't-1', outputFormat: 'json' });
    const surface = buildApiSurface();
    await surface.templates.run({ templateId: 'tmpl-1', params: { foo: 'bar' } });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('templates:run', { templateId: 'tmpl-1', params: { foo: 'bar' } });
  });

  it('templates.list invokes templates:list', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const surface = buildApiSurface();
    await surface.templates.list();
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('templates:list');
  });

  it('kbSearch namespace exposes retrieve', () => {
    const surface = buildApiSurface();
    expect(typeof surface.kbSearch).toBe('object');
    expect(typeof surface.kbSearch.retrieve).toBe('function');
  });

  it('kbSearch.retrieve invokes kb-search:retrieve with query and topK', async () => {
    (ipcRenderer.invoke as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const surface = buildApiSurface();
    await surface.kbSearch.retrieve({ query: 'hello', topK: 3 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('kb-search:retrieve', { query: 'hello', topK: 3 });
  });
});
