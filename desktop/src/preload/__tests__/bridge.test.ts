import { describe, it, expect } from 'vitest';
import { buildApiSurface } from '../context-bridge';

describe('context-bridge api surface', () => {
  it('exposes only the whitelisted namespaces', () => {
    const surface = buildApiSurface();
    expect(Object.keys(surface).sort()).toEqual(['agent', 'auth', 'browser', 'kb']);
  });

  it('each namespace is a function group, not raw ipcRenderer', () => {
    const surface = buildApiSurface();
    expect(typeof surface.auth).toBe('object');
    expect(typeof surface.auth.login).toBe('function');
  });
});
