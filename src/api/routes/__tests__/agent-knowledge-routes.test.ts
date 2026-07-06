import { describe, it, expect } from 'vitest';
import { handleAgentKnowledgeRoutes } from '../agent-knowledge-routes.ts';
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

describe('handleAgentKnowledgeRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleAgentKnowledgeRoutes).toBe('function');
  });

  it('returns false for non-agent URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleAgentKnowledgeRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });

  it('returns false for /api/v2/agents/:id/other', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/agents/agent-1/other');
    expect(await handleAgentKnowledgeRoutes(req, res, 'GET', '/api/v2/agents/agent-1/other')).toBe(false);
  });

  it('handles GET /api/v2/agents/:id/knowledge-refs', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/agents/agent-1/knowledge-refs');
    expect(await handleAgentKnowledgeRoutes(req, res, 'GET', '/api/v2/agents/agent-1/knowledge-refs')).toBe(true);
  });

  it('handles POST /api/v2/agents/:id/knowledge-refs', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/agents/agent-1/knowledge-refs');
    expect(await handleAgentKnowledgeRoutes(req, res, 'POST', '/api/v2/agents/agent-1/knowledge-refs')).toBe(true);
  });

  it('handles DELETE /api/v2/agents/:id/knowledge-refs/:refId', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/agents/agent-1/knowledge-refs/ref-xyz');
    expect(await handleAgentKnowledgeRoutes(req, res, 'DELETE', '/api/v2/agents/agent-1/knowledge-refs/ref-xyz')).toBe(true);
  });

  it('does NOT match PATCH on knowledge-refs (not supported)', async () => {
    const { req, res } = mockReqRes('PATCH', '/api/v2/agents/agent-1/knowledge-refs');
    expect(await handleAgentKnowledgeRoutes(req, res, 'PATCH', '/api/v2/agents/agent-1/knowledge-refs')).toBe(false);
  });
});
