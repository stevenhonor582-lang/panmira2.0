// 2026-06-27 commit 1 静态检查测试
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 1: knowledge-fetcher 修复静态检查", () => {
  const src = readFileSync("src/bridge/knowledge-fetcher.ts", "utf-8");

  it("B1: UPDATE 的是 memories 不是 documents", () => {
    expect(src).toMatch(/UPDATE memories SET hit_count/);
    expect(src.includes("UPDATE documents SET hit_count")).toBe(false);
  });

  it("B2: topScore log 输出 finalScore", () => {
    expect(src).toMatch(/topScore: rankedWithScore\[0\]\?\.finalScore/);
  });

  it("B3: ageBoost 加进 re-rank", () => {
    expect(src.includes("ageBoost")).toBe(true);
    expect(src.includes("createdTs > 0.7")).toBe(true);
  });

  it("B4+B5: ILIKE 用 extractBigrams", () => {
    expect(src.includes("Array.from(searchQuery).slice(0, 50)")).toBe(false);
    expect(src.includes("extractBigrams(searchQuery)")).toBe(true);
  });

  it("extractBigrams 函数存在", () => {
    expect(src.includes("function extractBigrams")).toBe(true);
    expect(src.includes("STOP_CHARS")).toBe(true);
  });

  it("re-rank 公式权重改了", () => {
    expect(src.includes("0.45*cosine")).toBe(true);
    expect(src.includes("0.15*ageBoost")).toBe(true);
  });
});
