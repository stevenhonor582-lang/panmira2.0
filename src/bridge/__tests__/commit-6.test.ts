// 2026-06-27 commit 6 静态检查
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 6: ranked 截断 + threshold", () => {
  const src = readFileSync("src/bridge/knowledge-fetcher.ts", "utf-8");

  it("ranked = rankedWithScore.map 是独立一行 (不是链)", () => {
    // 不能是 .map(x => x.r) 在 .slice(0, 5) 之后
    // 必须是独立行: ranked = rankedWithScore.map(x => x.r);
    expect(src).toMatch(/ranked = rankedWithScore\.map\(x => x\.r\);/);
  });

  it("MEMORY_VECTOR_THRESHOLD 降到 0.4", () => {
    expect(src).toMatch(/const MEMORY_VECTOR_THRESHOLD = 0\.4/);
  });

  it("没有 .slice(0, 5)\\n        .map(x => x.r) 的 bug 模式", () => {
    // 应该没有把 .map(x => x.r) 接在 .slice(0, 5) 后面
    expect(src).not.toMatch(/\.slice\(0, 5\)\s*\n\s*\.map\(x => x\.r\)/);
  });
});
