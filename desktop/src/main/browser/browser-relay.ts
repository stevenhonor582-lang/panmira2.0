import type { BrowserEngine } from './browser-engine.js';
import type { BrowserActions } from './browser-actions.js';
import type {
  BrowserApi,
  BrowserOpenResult,
  ViewportId,
} from '../../shared/ipc-contract.js';

export interface BrowserHandlersDeps {
  engine: Pick<BrowserEngine, 'launch' | 'navigate' | 'close'>;
  actions: Pick<BrowserActions, 'screenshot' | 'click' | 'fill' | 'extract'>;
}

export type BrowserHandlers = Record<keyof BrowserApi, (...args: any[]) => Promise<any>>;

/**
 * IPC relay: wraps engine + actions behind namespaced IPC channel keys.
 *
 * Returned handlers use the `browser:*` channel naming convention so they
 * can be registered directly with Electron's ipcMain.handle (e.g.
 * `ipcMain.handle('browser:open', handlers['browser:open'])`).
 */
export function createBrowserHandlers(deps: BrowserHandlersDeps): BrowserHandlers {
  const { engine, actions } = deps;
  return {
    'browser:open': async (taskId: string, url: string): Promise<BrowserOpenResult> => {
      const { sessionId } = await engine.launch(taskId);
      // Fire-and-forget navigate (must not reject the open call).
      // Guard against navigate being absent on partial test mocks.
      if (typeof engine.navigate === 'function') {
        void engine.navigate(sessionId, url).catch(() => undefined);
      }
      return { viewportId: sessionId };
    },
    'browser:screenshot': (viewportId: ViewportId) => actions.screenshot(viewportId),
    'browser:click': (viewportId: ViewportId, selector: string) =>
      actions.click(viewportId, selector),
    'browser:fill': (viewportId: ViewportId, selector: string, text: string) =>
      actions.fill(viewportId, selector, text),
    'browser:extract': (viewportId: ViewportId, selector: string) =>
      actions.extract(viewportId, selector),
    'browser:close': (viewportId: ViewportId) => engine.close(viewportId),
  };
}
