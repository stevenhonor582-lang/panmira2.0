import { describe, it, expect, vi } from 'vitest';
import { KbUploader } from '../upload-router';

vi.mock('axios');

describe('KbUploader', () => {
  it('uploads file to Panmira with auth header', async () => {
    const axios = (await import('axios')).default;
    vi.mocked(axios.create).mockReturnValue({
      post: vi.fn().mockResolvedValue({ data: { id: 'doc_123' } })
    } as any);

    const uploader = new KbUploader({
      baseUrl: 'https://panmira.example.com',
      getToken: async () => 'token_abc'
    });
    const result = await uploader.upload(Buffer.from('hello'), 'test.pdf');

    expect(result.id).toBe('doc_123');
  });

  it('passes the correct base URL and form data', async () => {
    const axios = (await import('axios')).default;
    const post = vi.fn().mockResolvedValue({ data: { id: 'doc_x' } });
    vi.mocked(axios.create).mockReturnValue({ post } as any);

    const uploader = new KbUploader({
      baseUrl: 'https://panmira.example.com',
      getToken: async () => 't'
    });
    await uploader.upload(Buffer.from('hi'), 'foo.txt');
    expect(axios.create).toHaveBeenCalledWith({ baseURL: 'https://panmira.example.com' });
    expect(post).toHaveBeenCalledWith(
      '/api/kb/documents',
      expect.any(FormData),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer t' })
      })
    );
  });
});
