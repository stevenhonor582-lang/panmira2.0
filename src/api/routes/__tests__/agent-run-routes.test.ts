import { describe, it, expect } from 'vitest';
import { handleAgentRunRoutes } from '../agent-run-routes.ts';
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

describe('handleAgentRunRoutes dispatch', () => {
  it('exports function', () => {
    expect(typeof handleAgentRunRoutes).toBe('function');
  });

  it('returns false for non-run URL', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/agents/agent-1/other');
    expect(await handleAgentRunRoutes(req, res, 'POST', '/api/v2/agents/agent-1/other')).toBe(false);
  });

  it('handles POST /api/v2/agents/:id/run', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/agents/agent-1/run');
    expect(await handleAgentRunRoutes(req, res, 'POST', '/api/v2/agents/agent-1/run')).toBe(true);
  });

  it('does NOT match GET on /run (only POST)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/agents/agent-1/run');
    expect(await handleAgentRunRoutes(req, res, 'GET', '/api/v2/agents/agent-1/run')).toBe(false);
  });
});
