import { describe, it, expect } from 'vitest';
import { handleKnowledgeBaseRoutes } from '../knowledge-base-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = {
    statusCode: 200,
    setHeader: () => {},
    writeHead: () => {},
    end: () => {},
  } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleKnowledgeBaseRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleKnowledgeBaseRoutes).toBe('function');
  });

  it('returns false for non-KB URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });

  it('returns false for /api/v2/admin/bots (out of scope)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/bots');
    expect(await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/v2/admin/bots')).toBe(false);
  });

  it('handles GET /api/v2/admin/knowledge-bases (reaches handler)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/knowledge-bases');
    // 没 Bearer → handler 内部 requireBearer 失败,但 dispatch 返回 true
    const handled = await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/v2/admin/knowledge-bases');
    expect(handled).toBe(true);
  });

  it('handles POST /api/v2/admin/knowledge-bases (reaches handler)', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/knowledge-bases');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'POST', '/api/v2/admin/knowledge-bases');
    expect(handled).toBe(true);
  });

  it('handles GET /api/v2/admin/knowledge-bases/:id (reaches handler)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/knowledge-bases/abc-123-uuid');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/v2/admin/knowledge-bases/abc-123-uuid');
    expect(handled).toBe(true);
  });

  it('handles PATCH /api/v2/admin/knowledge-bases/:id (reaches handler)', async () => {
    const { req, res } = mockReqRes('PATCH', '/api/v2/admin/knowledge-bases/abc-123');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'PATCH', '/api/v2/admin/knowledge-bases/abc-123');
    expect(handled).toBe(true);
  });

  it('handles DELETE /api/v2/admin/knowledge-bases/:id (reaches handler)', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/admin/knowledge-bases/abc-123');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'DELETE', '/api/v2/admin/knowledge-bases/abc-123');
    expect(handled).toBe(true);
  });

  it('handles POST /api/v2/admin/knowledge-bases/:id/indexing (reaches handler)', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/knowledge-bases/abc-123/indexing');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'POST', '/api/v2/admin/knowledge-bases/abc-123/indexing');
    expect(handled).toBe(true);
  });

  it('returns false for /api/v2/admin/knowledge-bases/:id/wrong-subpath', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/knowledge-bases/abc-123/wrong');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/v2/admin/knowledge-bases/abc-123/wrong');
    expect(handled).toBe(false);
  });
});

describe('handleKnowledgeBaseRoutes document dispatch', () => {
  it('handles GET /:id/documents', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/knowledge-bases/abc-123/documents');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'GET', '/api/v2/admin/knowledge-bases/abc-123/documents');
    expect(handled).toBe(true);
  });

  it('handles POST /:id/documents (bind)', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/knowledge-bases/abc-123/documents');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'POST', '/api/v2/admin/knowledge-bases/abc-123/documents');
    expect(handled).toBe(true);
  });

  it('handles POST /:id/documents/upload', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/knowledge-bases/abc-123/documents/upload');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'POST', '/api/v2/admin/knowledge-bases/abc-123/documents/upload');
    expect(handled).toBe(true);
  });

  it('handles POST /documents/:docId/versions', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/documents/doc-xyz/versions');
    const handled = await handleKnowledgeBaseRoutes(req, res, 'POST', '/api/v2/admin/documents/doc-xyz/versions');
    expect(handled).toBe(true);
  });
});
