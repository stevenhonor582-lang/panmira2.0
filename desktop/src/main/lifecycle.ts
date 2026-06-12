import { app, BrowserWindow, protocol, net } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MahAuthClient } from './auth/mah-auth-client.js';
import { registerAuthIpc } from './auth/ipc-handlers.js';
import { TokenStore } from './auth/token-store.js';
import { registerWsIpcBridge } from './ws/ipc-bridge.js';
import { WsClient } from './ws/ws-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const RENDERER_DIR = join(__dirname, '../renderer');

// Register app:// custom protocol so the renderer can load ES modules
// under a non-file:// origin (avoids Chromium CORS blocking module
// imports). Privileges must be set before app.whenReady().
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

export async function createMainWindow(): Promise<BrowserWindow> {
  // Register the app:// scheme handler that serves files from the
  // renderer directory.
  await app.whenReady();
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let filePath = join(RENDERER_DIR, url.pathname);
    if (url.pathname === '/' || url.pathname === '') {
      filePath = join(RENDERER_DIR, 'index.html');
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });

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
    await win.loadURL('app://localhost/');
  }
  win.show();
  app.on('window-all-closed', () => {
    app.quit();
  });
  return win;
}
