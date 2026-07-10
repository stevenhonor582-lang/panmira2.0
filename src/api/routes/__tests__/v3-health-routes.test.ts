/**
 * R49-B v3 health route — 单元测试
 *
 * 注: 完整 health check 涉及 DB/Redis 真实连接,这里只验证:
 * - 路由 handler 在错误路径下的统一 envelope 行为
 * - 响应状态码/数据结构正确
 */
import { describe, it, expect, vi } from "vitest";
import { handleV3HealthRoutes } from "../v3-health-routes.js";

function makeRes(): any {
  const chunks: Buffer[] = [];
  const headers: Record<string, any> = {};
  const res: any = {
    statusCode: 200,
    setHeader(k: string, v: any) { headers[k] = v; },
    writeHead(s: number, h?: any) { res.statusCode = s; if (h) Object.assign(headers, h); },
    end(c?: any) { if (c) chunks.push(Buffer.from(String(c))); res._body = Buffer.concat(chunks).toString(); res._headers = headers; },
  };
  return res;
}

function makeReq(headers: Record<string, string> = {}): any {
  const { EventEmitter } = require("node:events");
  return Object.assign(new EventEmitter(), { headers, url: "/api/v3/health", method: "GET" });
}

describe("handleV3HealthRoutes", () => {
  it("returns false for non-v3-health URLs", async () => {
    const req = makeReq();
    const res = makeRes();
    const handled = await handleV3HealthRoutes(req, res, "GET", "/api/v2/health");
    expect(handled).toBe(false);
  });

  it("returns false for non-GET methods", async () => {
    const req = makeReq();
    const res = makeRes();
    const handled = await handleV3HealthRoutes(req, res, "POST", "/api/v3/health");
    expect(handled).toBe(false);
  });

  it("handles GET /api/v3/health and returns unified envelope", async () => {
    // mock db pool
    vi.doMock("../../../db/index.js", () => ({
      pool: { query: async () => ({ rows: [{ alive: 1 }] }) },
    }));

    const req = makeReq({ "x-trace-id": "test-trace-id" });
    const res = makeRes();
    const handled = await handleV3HealthRoutes(req, res, "GET", "/api/v3/health");
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.checks).toBeDefined();
    expect(body.data.checks.db).toBeDefined();
    expect(body.meta.version).toBe("v3");
    expect(body.meta.traceId).toHaveLength(32);
    expect(body.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(["ok", "degraded"]).toContain(body.data.status);

    vi.doUnmock("../../../db/index.js");
  });
});
