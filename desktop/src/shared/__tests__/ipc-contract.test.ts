import { describe, it, expect } from 'vitest';
import type { BrowserApi, TemplatesApi, KbSearchApi } from '../ipc-contract.js';

describe('IPC contract types', () => {
  it('BrowserApi has the 6 required methods', () => {
    const mock: BrowserApi = {
      open: async () => ({ viewportId: 'v1' }),
      screenshot: async () => 'base64',
      click: async () => {},
      fill: async () => {},
      extract: async () => 'text',
      close: async () => {},
    };
    expect(mock.open).toBeDefined();
  });

  it('TemplatesApi has run + list', () => {
    const mock: TemplatesApi = {
      run: async () => ({ taskId: 't1' }),
      list: async () => [],
    };
    expect(mock.run).toBeDefined();
  });

  it('KbSearchApi has retrieve', () => {
    const mock: KbSearchApi = {
      retrieve: async () => [],
    };
    expect(mock.retrieve).toBeDefined();
  });
});
