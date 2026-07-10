/**
 * R49-B v1 deprecation middleware — 单元测试
 */
import { describe, it, expect } from "vitest";
import { isV1Path, inferSuccessor, markV1Deprecated, V1_SUNSET_DATE } from "../v1-deprecation.js";

function makeRes(): any {
  const headers: Record<string, any> = {};
  const res: any = {
    setHeader(k: string, v: any) { headers[k.toLowerCase()] = v; },
    getHeader(k: string) { return headers[k.toLowerCase()]; },
  };
  (res as any)._headers = headers;
  return res;
}

describe("isV1Path", () => {
  it("matches /api/v1/*", () => {
    expect(isV1Path("/api/v1/memory")).toBe(true);
    expect(isV1Path("/api/v1/bots/foo")).toBe(true);
  });

  it("matches /api/bots/* (legacy IM bridge)", () => {
    expect(isV1Path("/api/bots/list")).toBe(true);
    expect(isV1Path("/api/bots")).toBe(true);
  });

  it("matches /api/agents/* and /api/skills", () => {
    expect(isV1Path("/api/agents/run")).toBe(true);
    expect(isV1Path("/api/skills")).toBe(true);
  });

  it("does NOT match /api/v2/* or /api/v3/*", () => {
    expect(isV1Path("/api/v2/employees")).toBe(false);
    expect(isV1Path("/api/v3/employees")).toBe(false);
    expect(isV1Path("/api/health")).toBe(false);
    expect(isV1Path("/api/v3/health")).toBe(false);
  });

  it("handles query string", () => {
    expect(isV1Path("/api/v1/memory?session=abc")).toBe(true);
    expect(isV1Path("/api/v3/employees?page=1")).toBe(false);
  });
});

describe("inferSuccessor", () => {
  it("maps /api/v1/memory → /api/v3/memory", () => {
    expect(inferSuccessor("/api/v1/memory/list")).toBe("/api/v3/memory");
  });

  it("maps /api/bots/* → /api/v3/agents", () => {
    expect(inferSuccessor("/api/bots/list")).toBe("/api/v3/agents");
  });

  it("maps /api/agents/* → /api/v3/agents", () => {
    expect(inferSuccessor("/api/agents/run")).toBe("/api/v3/agents");
  });

  it("falls back to openapi.json", () => {
    expect(inferSuccessor("/api/v1/unknown")).toBe("/api/v3/openapi.json");
  });
});

describe("markV1Deprecated", () => {
  it("sets Deprecation/Sunset/Link for v1 path", () => {
    const res = makeRes();
    const result = markV1Deprecated(res, "/api/v1/memory/list");
    expect(result).toBe(true);
    expect(res.getHeader("Deprecation")).toBe("true");
    expect(res.getHeader("Sunset")).toBe(V1_SUNSET_DATE);
    expect(res.getHeader("Link")).toBe("<" + "/api/v3/memory" + ">; rel=\"successor-version\"");
    expect(res.getHeader("X-Panmira-Deprecated")).toContain(V1_SUNSET_DATE);
  });

  it("does NOT set headers for non-v1 path", () => {
    const res = makeRes();
    const result = markV1Deprecated(res, "/api/v3/employees");
    expect(result).toBe(false);
    expect(res.getHeader("Deprecation")).toBeUndefined();
    expect(res.getHeader("Sunset")).toBeUndefined();
  });

  it("is idempotent (marking twice does not duplicate)", () => {
    const res = makeRes();
    markV1Deprecated(res, "/api/v1/test");
    markV1Deprecated(res, "/api/v1/test");
    expect(res.getHeader("Deprecation")).toBe("true");
  });
});
