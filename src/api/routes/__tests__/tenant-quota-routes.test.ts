import { describe, it, expect } from 'vitest';
import { handleTenantQuotaRoutes } from '../tenant-quota-routes.ts';
import type http from 'node:http';

function mockReqRes(method: string, url: string): { req: http.IncomingMessage; res: http.ServerResponse } {
  const req = { method, url, headers: {} } as http.IncomingMessage;
  const res = { statusCode: 200, setHeader: () => {}, writeHead: () => {}, end: () => {} } as unknown as http.ServerResponse;
  return { req, res };
}

describe('handleTenantQuotaRoutes dispatch', () => {
  it('exports function', () => { expect(typeof handleTenantQuotaRoutes).toBe('function'); });
  it('returns false for non-quota URL', async () => {
    const { req, res } = mockReqRes('GET', '/api/other');
    expect(await handleTenantQuotaRoutes(req, res, 'GET', '/api/other')).toBe(false);
  });
  it('handles GET /tenants/:id/quotas', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/tenants/tenant-1/quotas');
    expect(await handleTenantQuotaRoutes(req, res, 'GET', '/api/v2/admin/tenants/tenant-1/quotas')).toBe(true);
  });
  it('handles POST /tenants/:id/quotas', async () => {
    const { req, res } = mockReqRes('POST', '/api/v2/admin/tenants/tenant-1/quotas');
    expect(await handleTenantQuotaRoutes(req, res, 'POST', '/api/v2/admin/tenants/tenant-1/quotas')).toBe(true);
  });
  it('handles PATCH /tenants/:id/quotas/:quotaId', async () => {
    const { req, res } = mockReqRes('PATCH', '/api/v2/admin/tenants/tenant-1/quotas/quota-1');
    expect(await handleTenantQuotaRoutes(req, res, 'PATCH', '/api/v2/admin/tenants/tenant-1/quotas/quota-1')).toBe(true);
  });
  it('handles DELETE /tenants/:id/quotas/:quotaId', async () => {
    const { req, res } = mockReqRes('DELETE', '/api/v2/admin/tenants/tenant-1/quotas/quota-1');
    expect(await handleTenantQuotaRoutes(req, res, 'DELETE', '/api/v2/admin/tenants/tenant-1/quotas/quota-1')).toBe(true);
  });
  it('does NOT match GET on item (only PATCH/DELETE)', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/tenants/tenant-1/quotas/quota-1');
    expect(await handleTenantQuotaRoutes(req, res, 'GET', '/api/v2/admin/tenants/tenant-1/quotas/quota-1')).toBe(false);
  });
  it('returns false for /tenants/:id/quotas/wrong-subpath', async () => {
    const { req, res } = mockReqRes('GET', '/api/v2/admin/tenants/tenant-1/quotas/sub/x');
    expect(await handleTenantQuotaRoutes(req, res, 'GET', '/api/v2/admin/tenants/tenant-1/quotas/sub/x')).toBe(false);
  });
});
