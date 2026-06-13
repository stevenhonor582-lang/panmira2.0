import { contextBridge, ipcRenderer } from 'electron';
import type { BrowserApi, TemplatesApi, KbSearchApi } from '../shared/ipc-contract';

type ApiSurface = {
  auth: {
    login: () => Promise<{ accessToken: string }>;
    logout: () => Promise<void>;
    getProfile: () => Promise<{ id: string; name: string }>;
  };
  kb: {
    list: () => Promise<Array<{ id: string; name: string }>>;
    upload: (filePath: string) => Promise<{ id: string }>;
  };
  agent: {
    chat: (message: string) => Promise<AsyncIterable<string>>;
  };
  browser: {
    // v0.1 — keep for backwards compatibility with existing callers
    publish: (contentId: string, platform: string) => Promise<{ ok: boolean }>;
  } & BrowserApi;
  templates: TemplatesApi;
  kbSearch: KbSearchApi;
};

export function buildApiSurface(): ApiSurface {
  return {
    auth: {
      login: () => ipcRenderer.invoke('auth:login'),
      logout: () => ipcRenderer.invoke('auth:logout'),
      getProfile: () => ipcRenderer.invoke('auth:getProfile')
    },
    kb: {
      list: () => ipcRenderer.invoke('kb:list'),
      upload: (filePath) => ipcRenderer.invoke('kb:upload', filePath)
    },
    agent: {
      chat: (message) => ipcRenderer.invoke('agent:chat', message)
    },
    browser: {
      // v0.1 — unchanged
      publish: (contentId, platform) =>
        ipcRenderer.invoke('browser:publish', { contentId, platform }),
      // v0.2 — browser automation
      open: (taskId, url) => ipcRenderer.invoke('browser:open', taskId, url),
      screenshot: (viewportId) => ipcRenderer.invoke('browser:screenshot', viewportId),
      click: (viewportId, selector) =>
        ipcRenderer.invoke('browser:click', viewportId, selector),
      fill: (viewportId, selector, text) =>
        ipcRenderer.invoke('browser:fill', viewportId, selector, text),
      extract: (viewportId, selector) =>
        ipcRenderer.invoke('browser:extract', viewportId, selector),
      close: (viewportId) => ipcRenderer.invoke('browser:close', viewportId)
    },
    templates: {
      run: (args) => ipcRenderer.invoke('templates:run', args),
      list: () => ipcRenderer.invoke('templates:list')
    },
    kbSearch: {
      retrieve: (args) => ipcRenderer.invoke('kb-search:retrieve', args)
    }
  };
}

// 在实际 preload 中执行
// contextBridge.exposeInMainWorld('panmira', buildApiSurface());
