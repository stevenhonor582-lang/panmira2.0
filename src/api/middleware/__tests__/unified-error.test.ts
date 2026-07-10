/**
 * R49-B 统一错误响应中间件 — 单元测试
 */
import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  ApiException,
  sendOk,
  sendCreated,
  sendAccepted,
  sendNoContent,
  sendError,
  withErrorBoundary,
  handleCaughtError,
} from "../unified-error.js";
import { ErrorCode } from "../../contract/index.js";

// Helper: 创建 fake ServerResponse 收集写入
function makeRes(): any {
  const chunks: Buffer[] = [];
  const headers: Record<string, string | number> = {};
  const res: any = {
    statusCode: 200,
    setHeader(k: string, v: string | number) { headers[k] = v; },
    getHeader(k: string) { return headers[k]; },
    writeHead(s: number, h?: Record<string, string>) {
      res.statusCode = s;
      if (h) Object.assign(headers, h);
    },
    end(chunk?: any) {
      if (chunk) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      (res as any)._body = Buffer.concat(chunks).toString();
      (res as any)._headers = headers;
    },
  };
  return res;
}

function parseBody(res: any): any {
  return JSON.parse(res._body);
}

describe("sendOk / sendCreated / sendAccepted", () => {
  it("sendOk returns 200 + envelope with meta", () => {
    const res = makeRes();
    sendOk(res, { id: 1 }, "v3");
    expect(res.statusCode).toBe(200);
    const body = parseBody(res);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 1 });
    expect(body.meta.version).toBe("v3");
    expect(body.meta.traceId).toHaveLength(32);
    expect(body.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("sendCreated returns 201", () => {
    const res = makeRes();
    sendCreated(res, { id: 99 }, "v3");
    expect(res.statusCode).toBe(201);
    expect(parseBody(res).success).toBe(true);
  });

  it("sendAccepted returns 202", () => {
    const res = makeRes();
    sendAccepted(res, { taskId: "abc" }, "v3");
    expect(res.statusCode).toBe(202);
  });

  it("sendNoContent returns 204 with empty body", () => {
    const res = makeRes();
    sendNoContent(res);
    expect(res.statusCode).toBe(204);
    expect(res._body).toBe("");
  });

  it("preserves explicit traceId", () => {
    const res = makeRes();
    sendOk(res, {}, "v3", "fixed-trace-123");
    expect(parseBody(res).meta.traceId).toBe("fixed-trace-123");
  });
});

describe("sendError", () => {
  it("uses ERROR_STATUS_MAP for status code", () => {
    const res = makeRes();
    sendError(res, { code: ErrorCode.NOT_FOUND, message: "x" }, "v3");
    expect(res.statusCode).toBe(404);
    const body = parseBody(res);
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.meta.version).toBe("v3");
  });

  it("respects explicit statusCode override", () => {
    const res = makeRes();
    sendError(res, { code: ErrorCode.NOT_FOUND, message: "x" }, "v3", undefined, 418);
    expect(res.statusCode).toBe(418);
  });

  it("masks 5xx empty message", () => {
    const res = makeRes();
    sendError(res, { code: ErrorCode.INTERNAL_ERROR, message: "" }, "v3");
    expect(res.statusCode).toBe(500);
    const body = parseBody(res);
    expect(body.error.message).toBe("Internal Server Error");
  });
});

describe("ApiException", () => {
  it("carries apiError + statusCode from ERROR_STATUS_MAP", () => {
    const e = new ApiException(ErrorCode.NOT_FOUND, "agent missing");
    expect(e.name).toBe("ApiException");
    expect(e.apiError.code).toBe("NOT_FOUND");
    expect(e.apiError.message).toBe("agent missing");
    expect(e.statusCode).toBe(404);
  });

  it("accepts explicit statusCode override", () => {
    const e = new ApiException(ErrorCode.NOT_FOUND, "x", { statusCode: 410 });
    expect(e.statusCode).toBe(410);
  });
});

describe("withErrorBoundary", () => {
  function makeReq(headers: Record<string, string> = {}): any {
    return Object.assign(new EventEmitter(), { headers }) as any;
  }

  it("passes through successful handler", async () => {
    const req = makeReq();
    const res = makeRes();
    await withErrorBoundary(req, res, "v3", () => {
      sendOk(res, { ok: true }, "v3");
    });
    expect(parseBody(res).success).toBe(true);
  });

  it("catches ApiException", async () => {
    const req = makeReq({ "x-trace-id": "fixed-trace-1" });
    const res = makeRes();
    await withErrorBoundary(req, res, "v3", () => {
      throw new ApiException(ErrorCode.VALIDATION_ERROR, "bad input");
    });
    expect(res.statusCode).toBe(422);
    const body = parseBody(res);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.meta.traceId).toBe("fixed-trace-1");
  });

  it("catches generic Error as INTERNAL_ERROR", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeReq();
    const res = makeRes();
    await withErrorBoundary(req, res, "v3", () => {
      throw new Error("boom");
    });
    expect(res.statusCode).toBe(500);
    const body = parseBody(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("boom");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("handles non-Error throw (string)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = makeReq();
    const res = makeRes();
    await withErrorBoundary(req, res, "v3", () => {
      // eslint-disable-next-line no-throw-literal
      throw "string-error";
    });
    expect(res.statusCode).toBe(500);
    const body = parseBody(res);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("Internal Server Error");
    consoleSpy.mockRestore();
  });

  it("handles Error with statusCode field (legacy compat)", async () => {
    const req = makeReq();
    const res = makeRes();
    const legacyErr = Object.assign(new Error("too large"), { statusCode: 413 });
    await withErrorBoundary(req, res, "v3", () => {
      throw legacyErr;
    });
    expect(res.statusCode).toBe(413);
    const body = parseBody(res);
    expect(body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns true when handler completes (handler ran)", async () => {
    const req = makeReq();
    const res = makeRes();
    const result = await withErrorBoundary(req, res, "v3", () => {
      sendOk(res, {}, "v3");
    });
    expect(result).toBe(true);
  });
});

describe("handleCaughtError mapping", () => {
  it("maps 401 to UNAUTHENTICATED", () => {
    const res = makeRes();
    const err = Object.assign(new Error("nope"), { statusCode: 401 });
    handleCaughtError(err, res, "v3", "tid");
    expect(parseBody(res).error.code).toBe("UNAUTHENTICATED");
  });

  it("maps 503 to SERVICE_UNAVAILABLE", () => {
    const res = makeRes();
    const err = Object.assign(new Error("down"), { statusCode: 503 });
    handleCaughtError(err, res, "v3", "tid");
    expect(parseBody(res).error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
