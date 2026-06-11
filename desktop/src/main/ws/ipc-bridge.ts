// desktop/src/main/ws/ipc-bridge.ts
import { BrowserWindow } from 'electron';
import type { WsClient } from './ws-client';

export function registerWsIpcBridge(
  ws: WsClient,
  getWindow: () => BrowserWindow | null
): void {
  const events = [
    'open',
    'disconnect',
    'reconnect',
    'agent_step',
    'content_delta',
    'bus_event',
    'done',
    'error'
  ] as const;

  for (const eventName of events) {
    ws.on(eventName, (payload: unknown) => {
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send('ws:event', { type: eventName, payload });
      }
    });
  }
}
