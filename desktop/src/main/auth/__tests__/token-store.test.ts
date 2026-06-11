import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn(),
    setPassword: vi.fn(),
    deletePassword: vi.fn()
  }
}));

import keytar from 'keytar';
import { TokenStore } from '../token-store';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new TokenStore('panmira-desktop');
  });

  it('returns null when no token stored', async () => {
    vi.mocked(keytar.getPassword).mockResolvedValue(null);
    expect(await store.getAccessToken()).toBeNull();
  });

  it('saves and retrieves token', async () => {
    vi.mocked(keytar.setPassword).mockResolvedValue();
    vi.mocked(keytar.getPassword).mockResolvedValue('abc123');

    await store.saveAccessToken('abc123');
    expect(await store.getAccessToken()).toBe('abc123');
    expect(keytar.setPassword).toHaveBeenCalledWith('panmira-desktop', 'access_token', 'abc123');
  });

  it('clears all tokens on clear()', async () => {
    await store.clear();
    expect(keytar.deletePassword).toHaveBeenCalledWith('panmira-desktop', 'access_token');
    expect(keytar.deletePassword).toHaveBeenCalledWith('panmira-desktop', 'refresh_token');
  });
});
