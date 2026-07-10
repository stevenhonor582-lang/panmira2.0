/**
 * R49-B 统一认证中间件 — 单元测试
 */
import { describe, it, expect } from "vitest";
import { requireScope, requireAnyScopeOrThrow, requireScopesOrThrow } from "../auth.js";
import type { OAuthContext } from "../auth.js";

const ctx: OAuthContext = {
  tenantId: "t1",
  userId: "u1",
  clientId: "c1",
  tokenId: "tk1",
  scopes: ["agent:read", "agent:run", "team:read"],
};

const adminCtx: OAuthContext = { ...ctx, scopes: ["*"] };

describe("requireScope (single)", () => {
  it("passes when scope present", () => {
    expect(() => requireScope(ctx, "agent:read")).not.toThrow();
  });

  it("throws ApiException(403) when missing", () => {
    expect(() => requireScope(ctx, "admin:super")).toThrowError(
      expect.objectContaining({
        apiError: expect.objectContaining({ code: "INSUFFICIENT_SCOPE" }),
        statusCode: 403,
      })
    );
  });

  it("admin wildcard passes any scope", () => {
    expect(() => requireScope(adminCtx, "anything")).not.toThrow();
  });
});

describe("requireAnyScopeOrThrow", () => {
  it("passes when one matches", () => {
    expect(() => requireAnyScopeOrThrow(ctx, ["admin:super", "agent:read"])).not.toThrow();
  });

  it("throws when none match", () => {
    expect(() => requireAnyScopeOrThrow(ctx, ["admin:super", "billing:read"])).toThrowError(
      expect.objectContaining({ statusCode: 403 })
    );
  });

  it("wildcard passes", () => {
    expect(() => requireAnyScopeOrThrow(adminCtx, ["x", "y"])).not.toThrow();
  });
});

describe("requireScopesOrThrow (all required)", () => {
  it("passes when all present", () => {
    expect(() => requireScopesOrThrow(ctx, ["agent:read", "agent:run"])).not.toThrow();
  });

  it("throws when any missing", () => {
    expect(() => requireScopesOrThrow(ctx, ["agent:read", "admin:super"])).toThrowError(
      expect.objectContaining({
        apiError: expect.objectContaining({
          code: "INSUFFICIENT_SCOPE",
          details: expect.objectContaining({ missing: ["admin:super"] }),
        }),
      })
    );
  });

  it("wildcard passes all", () => {
    expect(() => requireScopesOrThrow(adminCtx, ["x", "y", "z"])).not.toThrow();
  });
});
