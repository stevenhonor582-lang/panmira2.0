import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    on: vi.fn(),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    getPath: vi.fn(() => '/tmp/panmira-userdata')
  },
  BrowserWindow: vi.fn(() => ({
    loadURL: vi.fn(),
    loadFile: vi.fn(),
    on: vi.fn(),
    show: vi.fn(),
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() }
  })),
  ipcMain: {
    handle: vi.fn()
  },
  protocol: {
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn(() => Promise.resolve())
  },
  net: {
    fetch: vi.fn(() => Promise.resolve({}))
  }
}));

vi.mock('../auth/token-store', () => ({
  TokenStore: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../auth/mah-auth-client', () => ({
  MahAuthClient: vi.fn().mockImplementation(() => ({
    login: vi.fn(),
    logout: vi.fn(),
    getProfile: vi.fn(),
    refresh: vi.fn()
  }))
}));

vi.mock('../auth/ipc-handlers', () => ({
  registerAuthIpc: vi.fn()
}));

vi.mock('../ws/ws-client', () => ({
  WsClient: vi.fn().mockImplementation(() => ({
    on: vi.fn()
  }))
}));

vi.mock('../ws/ipc-bridge', () => ({
  registerWsIpcBridge: vi.fn()
}));

vi.mock('../kb-search/embedder', () => ({
  Embedder: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../kb-search/retriever', () => ({
  Retriever: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../kb-search/ipc', () => ({
  createKbSearchHandlers: vi.fn(() => ({
    'kb-search:retrieve': vi.fn()
  }))
}));

vi.mock('../browser/browser-engine', () => ({
  BrowserEngine: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../browser/browser-actions', () => ({
  BrowserActions: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../browser/browser-relay', () => ({
  createBrowserHandlers: vi.fn(() => ({}))
}));

vi.mock('../templates/loader', () => ({
  createDefaultRegistry: vi.fn(() => ({}))
}));

vi.mock('../templates/template-runner', () => ({
  TemplateRunner: vi.fn().mockImplementation(() => ({}))
}));

vi.mock('../templates/ipc', () => ({
  createTemplateHandlers: vi.fn(() => ({
    'templates:list': vi.fn(),
    'templates:run': vi.fn()
  }))
}));

vi.mock('../agent/stream-router', () => ({
  StreamRouter: vi.fn().mockImplementation(() => ({
    emit: vi.fn()
  }))
}));

vi.mock('../agent/stream-to-string', () => ({
  streamToString: vi.fn(() => Promise.resolve(''))
}));

describe('app lifecycle', () => {
  it('creates a BrowserWindow when app is ready', async () => {
    const { createMainWindow } = await import('../lifecycle');
    const { app, BrowserWindow, protocol, net } = await import('electron');
    const { registerAuthIpc } = await import('../auth/ipc-handlers');
    const { registerWsIpcBridge } = await import('../ws/ipc-bridge');

    await createMainWindow();

    expect(app.whenReady).toHaveBeenCalled();
    expect(protocol.handle).toHaveBeenCalledWith('app', expect.any(Function));
    expect(net.fetch).toBeDefined();
    expect(BrowserWindow).toHaveBeenCalled();
    expect(registerAuthIpc).toHaveBeenCalled();
    expect(registerWsIpcBridge).toHaveBeenCalled();
    expect(app.on).toHaveBeenCalledWith('window-all-closed', expect.any(Function));
  });
});
