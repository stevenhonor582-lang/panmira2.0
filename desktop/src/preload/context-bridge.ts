import { contextBridge, ipcRenderer } from 'electron';

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
    publish: (contentId: string, platform: string) => Promise<{ ok: boolean }>;
  };
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
      publish: (contentId, platform) =>
        ipcRenderer.invoke('browser:publish', { contentId, platform })
    }
  };
}

// 在实际 preload 中执行
// contextBridge.exposeInMainWorld('panmira', buildApiSurface());
