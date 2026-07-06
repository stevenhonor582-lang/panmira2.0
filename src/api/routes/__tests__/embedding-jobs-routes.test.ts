import { describe, it, expect } from 'vitest';
import { handleEmbeddingJobsRoutes } from '../embedding-jobs-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleEmbeddingJobsRoutes', () => {
  it('exports function', () => { expect(typeof handleEmbeddingJobsRoutes).toBe('function'); });
  it('returns false for non-jobs URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleEmbeddingJobsRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });
  it('handles GET /:id', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/embedding-jobs/abc-123');
    expect(await handleEmbeddingJobsRoutes(req, res, 'GET', '/api/v2/admin/embedding-jobs/abc-123')).toBe(true);
  });
  it('does NOT match POST', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/embedding-jobs/abc-123');
    expect(await handleEmbeddingJobsRoutes(req, res, 'POST', '/api/v2/admin/embedding-jobs/abc-123')).toBe(false);
  });
  it('returns false for /:id/subpath', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/embedding-jobs/abc/sub');
    expect(await handleEmbeddingJobsRoutes(req, res, 'GET', '/api/v2/admin/embedding-jobs/abc/sub')).toBe(false);
  });
});
