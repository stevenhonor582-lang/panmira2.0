import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { TokenStore } from './auth/token-store.js';
import { MahAuthClient } from './auth/mah-auth-client.js';
import { registerAuthIpc } from './auth/ipc-handlers.js';
import { WsClient } from './ws/ws-client.js';
import { registerWsIpcBridge } from './ws/ipc-bridge.js';

const isDev = process.env.NODE_ENV === 'development';

export async function createMainWindow(): Promise<BrowserWindow> {
  await app.whenReady();

  // Wire IPC handlers
  const tokenStore = new TokenStore();
  const mahAuth = new MahAuthClient({
    baseUrl: process.env.PANMIRA_URL || 'http://43.135.149.34:9100',
    tokenStore
  });
  registerAuthIpc({ mahAuth, tokenStore });

  // WS client + bridge
  const ws = new WsClient({
    url: (process.env.PANMIRA_URL || 'ws://43.135.149.34:9100') + '/ws',
    token: '' // populated after login
  });
  let mainWindow: BrowserWindow | null = null;
  registerWsIpcBridge(ws, () => mainWindow);

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/context-bridge.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = win;

  if (isDev) {
    await win.loadURL('http://localhost:5173');
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  win.show();
  app.on('window-all-closed', () => {
    app.quit();
  });
  return win;
}
