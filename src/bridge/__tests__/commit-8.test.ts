// 2026-06-27 commit 8 静态检查测试
// A: RAG top 5 -> top 20
// B: memory-writer 保留完整 windowText 到 metadata_json
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 8: RAG top 5 -> 20", () => {
  const kf = readFileSync("src/bridge/knowledge-fetcher.ts", "utf-8");

  it("ranked slice 0 5 -> 0 20 (主 RAG)", () => {
    expect(kf).toMatch(/\.slice\(0, 20\)/);
  });

  it("convRanked slice(0, 5) 保留 (对话历史辅助 RAG, 独立 path)", () => {
    // commit 8 不动 convRanked (user 没明确说要改)
    expect(kf).toMatch(/convRanked.*slice\(0, 5\)/s);
  });

  it("memoryInjectedIds slice 0 3 -> 0 20 (跟 ranked top 一致)", () => {
    expect(kf).toMatch(/memoryResults as any\[\]\)\.slice\(0, 20\)/);
  });

  it("commit 7 UPDATE 块保留", () => {
    expect(kf).toMatch(/hit_count = COALESCE\(hit_count, 0\) \+ 1/);
  });
});

describe("commit 8: memory-writer 保留 original_window_text", () => {
  const mw = readFileSync("src/bridge/memory-writer.ts", "utf-8");

  it("metadata_json 加 original_window_text 字段", () => {
    expect(mw).toMatch(/original_window_text:\s*windowText\.slice/);
  });

  it("5KB 截断标记", () => {
    expect(mw).toMatch(/original_window_truncated:\s*windowText\.length > 5000/);
    expect(mw).toMatch(/original_window_length:\s*windowText\.length/);
  });

  it("source_quote 字段保留", () => {
    expect(mw).toMatch(/source_quote:\s*cand\.source_quote/);
  });
});
