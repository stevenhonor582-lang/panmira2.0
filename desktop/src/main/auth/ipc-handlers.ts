// desktop/src/main/auth/ipc-handlers.ts
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { MahAuthClient } from './mah-auth-client';
import type { TokenStore } from './token-store';

export interface AuthIpcDeps {
  mahAuth: MahAuthClient;
  tokenStore: TokenStore;
}

export function registerAuthIpc(deps: AuthIpcDeps): void {
  ipcMain.handle('auth:login', async (_e: IpcMainInvokeEvent, creds: { email: string; password: string }) => {
    return deps.mahAuth.login(creds);
  });

  ipcMain.handle('auth:logout', async () => {
    await deps.mahAuth.logout();
  });

  ipcMain.handle('auth:getProfile', async () => {
    return deps.mahAuth.getProfile();
  });

  ipcMain.handle('auth:refresh', async () => {
    return deps.mahAuth.refresh();
  });
}
