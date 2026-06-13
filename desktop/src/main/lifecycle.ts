import { app, BrowserWindow, ipcMain, protocol, net } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MahAuthClient } from './auth/mah-auth-client.js';
import { registerAuthIpc } from './auth/ipc-handlers.js';
import { TokenStore } from './auth/token-store.js';
import { registerWsIpcBridge } from './ws/ipc-bridge.js';
import { WsClient } from './ws/ws-client.js';
import { Embedder } from './kb-search/embedder.js';
import { Retriever } from './kb-search/retriever.js';
import { createKbSearchHandlers } from './kb-search/ipc.js';
import { BrowserEngine } from './browser/browser-engine.js';
import { BrowserActions } from './browser/browser-actions.js';
import { createBrowserHandlers } from './browser/browser-relay.js';
import { createDefaultRegistry } from './templates/loader.js';
import { TemplateRunner } from './templates/template-runner.js';
import { createTemplateHandlers } from './templates/ipc.js';
import { StreamRouter } from './agent/stream-router.js';
import { streamToString } from './agent/stream-to-string.js';

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

  // v0.2 modules: KB search, browser, templates
  // KB search: Embedder + Retriever
  const embedder = new Embedder({
    apiKey: process.env.OPENAI_API_KEY ?? '',
    baseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com'
  });
  const userData = app.getPath('userData');
  const retriever = new Retriever({
    kbDir: join(userData, 'kb'),
    manifestPath: join(userData, 'kb', 'manifest.json'),
    embedder
  });
  const kbHandlers = createKbSearchHandlers({ retriever });
  ipcMain.handle('kb-search:retrieve', (_e, args) => kbHandlers['kb-search:retrieve'](args));

  // Browser: engine + actions + handlers
  const browserEngine = new BrowserEngine();
  const browserActions = new BrowserActions(browserEngine);
  const browserHandlers = createBrowserHandlers({ engine: browserEngine, actions: browserActions });
  for (const [channel, handler] of Object.entries(browserHandlers)) {
    ipcMain.handle(channel, (_e, ...args) => (handler as (...a: unknown[]) => unknown)(...args));
  }

  // Templates: registry + runner
  // The runner needs a `streamAgent(prompt) => Promise<string>` function.
  // We bridge WS content_delta events into a StreamRouter via streamToString.
  // A new StreamRouter is created here for template-runner streaming;
  // the existing ws-bridge forwards WS events to the renderer, so we add
  // a parallel listener on the WS to feed the template runner's router.
  const streamRouter = new StreamRouter();
  ws.on('content_delta', (payload: unknown) => {
    const p = payload as { delta?: string };
    if (typeof p?.delta === 'string') streamRouter.emit('content', p.delta);
  });
  ws.on('done', () => streamRouter.emit('done'));
  ws.on('error', (err: unknown) => streamRouter.emit('error', err instanceof Error ? err : new Error(String(err))));

  const registry = createDefaultRegistry();
  const runner = new TemplateRunner({
    registry,
    retriever,
    browser: browserActions,
    streamAgent: (prompt: string) => streamToString(prompt, streamRouter)
  });
  const tplHandlers = createTemplateHandlers({ registry, runner });
  ipcMain.handle('templates:list', () => tplHandlers['templates:list']());
  ipcMain.handle('templates:run', (_e, args) => tplHandlers['templates:run'](args));

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
