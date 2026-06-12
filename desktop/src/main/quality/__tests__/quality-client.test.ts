import { describe, it, expect, vi } from 'vitest';
import { QualityClient } from '../quality-client';

vi.mock('axios');

describe('QualityClient.review', () => {
  it('returns PASS when no issues found', async () => {
    const axios = (await import('axios')).default;
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn().mockResolvedValue({
        data: { verdict: 'PASS', issues: [] }
      })
    } as any);

    const client = new QualityClient({ baseUrl: 'https://panmira.example.com', getToken: async () => 't' });
    const result = await client.review({ action: 'browser_login', target: 'alibaba' });
    expect(result.verdict).toBe('PASS');
  });

  it('returns FAIL with reasons', async () => {
    const axios = (await import('axios')).default;
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn().mockResolvedValue({
        data: { verdict: 'FAIL', issues: ['domain mismatch'] }
      })
    } as any);

    const client = new QualityClient({ baseUrl: 'https://panmira.example.com', getToken: async () => 't' });
    const result = await client.review({ action: 'browser_login', target: 'malicious.com' });
    expect(result.verdict).toBe('FAIL');
    expect(result.issues).toContain('domain mismatch');
  });
});
