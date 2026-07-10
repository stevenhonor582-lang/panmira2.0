/**
 * R49-B API 层统一契约 — 单元测试
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import {
  generateTraceId, nowIso, resolveTraceId,
  StatusCode, ErrorCode, ERROR_STATUS_MAP, makeError,
  parseBody, parseQuery,
  PaginationQuerySchema, IdParamSchema, z,
} from "../index.js";

describe("traceId & timestamp", () => {
  it("generateTraceId returns unique 32-char hex", () => {
    const a = generateTraceId();
    const b = generateTraceId();
    expect(a).toHaveLength(32);
    expect(b).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });

  it("nowIso returns ISO-8601", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("resolveTraceId prefers x-trace-id header", () => {
    const req = Object.assign(new EventEmitter(), { headers: { "x-trace-id": "abc-123" } }) as any;
    expect(resolveTraceId(req)).toBe("abc-123");
  });

  it("resolveTraceId falls back to x-request-id", () => {
    const req = Object.assign(new EventEmitter(), { headers: { "x-request-id": "req-9" } }) as any;
    expect(resolveTraceId(req)).toBe("req-9");
  });

  it("resolveTraceId generates new id when header missing", () => {
    const req = Object.assign(new EventEmitter(), { headers: {} }) as any;
    expect(resolveTraceId(req)).toHaveLength(32);
  });

  it("resolveTraceId rejects oversized header (>64 chars)", () => {
    const req = Object.assign(new EventEmitter(), { headers: { "x-trace-id": "x".repeat(100) } }) as any;
    expect(resolveTraceId(req)).toHaveLength(32);
  });
});

describe("ErrorCode & ERROR_STATUS_MAP", () => {
  it("UNAUTHENTICATED maps to 401", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.UNAUTHENTICATED]).toBe(StatusCode.UNAUTHORIZED);
  });
  it("INSUFFICIENT_SCOPE maps to 403", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.INSUFFICIENT_SCOPE]).toBe(StatusCode.FORBIDDEN);
  });
  it("VALIDATION_ERROR maps to 422", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.VALIDATION_ERROR]).toBe(StatusCode.UNPROCESSABLE_ENTITY);
  });
  it("NOT_FOUND maps to 404", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.NOT_FOUND]).toBe(StatusCode.NOT_FOUND);
  });
  it("RATE_LIMITED maps to 429", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.RATE_LIMITED]).toBe(StatusCode.TOO_MANY_REQUESTS);
  });
  it("DATABASE_ERROR maps to 500", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.DATABASE_ERROR]).toBe(StatusCode.INTERNAL_SERVER_ERROR);
  });
  it("LLM_PROVIDER_ERROR maps to 502", () => {
    expect(ERROR_STATUS_MAP[ErrorCode.LLM_PROVIDER_ERROR]).toBe(502);
  });

  it("all error codes have status mapping", () => {
    const codes = Object.values(ErrorCode);
    expect(codes.length).toBeGreaterThanOrEqual(25);
    for (const c of codes) {
      expect(ERROR_STATUS_MAP[c]).toBeDefined();
    }
  });
});

describe("makeError", () => {
  it("creates error with code + message only", () => {
    const e = makeError(ErrorCode.NOT_FOUND, "agent not found");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.message).toBe("agent not found");
    expect(e.details).toBeUndefined();
    expect(e.source).toBeUndefined();
  });

  it("creates error with details + source", () => {
    const e = makeError(ErrorCode.DATABASE_ERROR, "PG conn refused", {
      details: { code: "ECONNREFUSED" }, source: "db",
    });
    expect(e.code).toBe("DATABASE_ERROR");
    expect(e.details).toEqual({ code: "ECONNREFUSED" });
    expect(e.source).toBe("db");
  });
});

describe("parseBody", () => {
  function makeReq(body: string | null): any {
    const req = new EventEmitter();
    (req as any).headers = { "content-type": "application/json" };
    process.nextTick(() => {
      if (body !== null) req.emit("data", Buffer.from(body));
      req.emit("end");
    });
    return req;
  }

  const TestSchema = z.object({
    name: z.string().min(1),
    age: z.number().int().min(0),
  });

  it("parses valid JSON", async () => {
    const req = makeReq(JSON.stringify({ name: "alice", age: 30 }));
    const result = await parseBody(req, TestSchema);
    expect(result).toEqual({ name: "alice", age: 30 });
  });

  it("throws VALIDATION_ERROR on missing fields", async () => {
    const req = makeReq(JSON.stringify({ name: "alice" }));
    await expect(parseBody(req, TestSchema)).rejects.toMatchObject({
      code: "VALIDATION_ERROR", source: "validation",
    });
  });

  it("throws INVALID_FORMAT on bad JSON", async () => {
    const req = makeReq("{bad json");
    await expect(parseBody(req, TestSchema)).rejects.toMatchObject({
      code: "INVALID_FORMAT", source: "json_parse",
    });
  });

  it("throws MISSING_FIELD on empty body", async () => {
    const req = makeReq("");
    await expect(parseBody(req, TestSchema)).rejects.toMatchObject({
      code: "MISSING_FIELD",
    });
  });
});

describe("parseQuery", () => {
  it("parses pagination with defaults", () => {
    const r = parseQuery("/api/v3/employees", PaginationQuerySchema);
    expect(r.page).toBe(1);
    expect(r.limit).toBe(50);
    expect(r.order).toBe("desc");
  });

  it("coerces page & limit from string", () => {
    const r = parseQuery("/api/v3/employees?page=3&limit=20", PaginationQuerySchema);
    expect(r.page).toBe(3);
    expect(r.limit).toBe(20);
  });

  it("rejects invalid limit (>200)", () => {
    expect(() => parseQuery("/api/v3/employees?limit=999", PaginationQuerySchema))
      .toThrowError(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it("IdParamSchema rejects non-UUID", () => {
    const r = IdParamSchema.safeParse({ id: "not-uuid" });
    expect(r.success).toBe(false);
    const ok = IdParamSchema.safeParse({ id: "123e4567-e89b-12d3-a456-426614174000" });
    expect(ok.success).toBe(true);
  });
});
