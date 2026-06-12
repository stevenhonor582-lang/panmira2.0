import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MahAuthClient } from '../mah-auth-client';

const mockPost = vi.fn();
const mockGet = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockPost,
      get: mockGet
    }))
  }
}));

describe('MahAuthClient', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
  });

  it('login POSTs credentials and stores tokens', async () => {
    mockPost.mockResolvedValue({
      data: { access_token: 'a1', refresh_token: 'r1', user: { id: 'u1', name: '老板' } }
    });
    const tokenStore = { saveTokens: vi.fn() };
    const client = new MahAuthClient({
      baseUrl: 'http://43.135.149.34:9100',
      tokenStore: tokenStore as any
    });
    const result = await client.login({ email: 'boss@example.com', password: 'pw' });
    expect(result.id).toBe('u1');
    expect(tokenStore.saveTokens).toHaveBeenCalledWith('a1', 'r1');
  });

  it('refresh calls /api/auth/refresh with refreshToken', async () => {
    mockPost.mockResolvedValue({ data: { access_token: 'a2' } });
    const tokenStore = { getRefreshToken: vi.fn(async () => 'r1'), saveAccessToken: vi.fn() };
    const client = new MahAuthClient({
      baseUrl: 'http://43.135.149.34:9100',
      tokenStore: tokenStore as any
    });
    await client.refresh();
    expect(mockPost).toHaveBeenCalledWith(
      '/api/auth/refresh',
      { refreshToken: 'r1' }
    );
  });
});
