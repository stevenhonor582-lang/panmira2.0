// 2026-06-27 commit 7 静态检查测试 (fixed)
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 7: UPDATE 块修 memoryResults", () => {
  const src = readFileSync("src/bridge/knowledge-fetcher.ts", "utf-8");

  it("UPDATE 用 memoryResults.slice (commit 7: 3, commit 8: 20) 不是 ranked.slice", () => {
    // commit 7: 3, commit 8: 20 (跟 ranked top 一致)
    expect(src).toMatch(/memoryResults as any\[\]\)\.slice\(0, 20\)/);
  });

  it("旧 metaRows.length > 0 闸门已删除", () => {
    expect(src.includes("metaRows.length > 0")).toBe(false);
  });

  it("旧 ranked.slice(0, 3).map(r => r.id) 已删除", () => {
    expect(src.includes("ranked.slice(0, 3).map(r => r.id)")).toBe(false);
  });

  it("用 try/catch 不用 .catch(debug)", () => {
    const updateIdx = src.indexOf("memoryInjectedIds.length > 0");
    expect(updateIdx).toBeGreaterThan(-1);
    const block = src.substring(updateIdx, updateIdx + 1500);
    expect(block.includes("try {")).toBe(true);
    expect(block.includes(".catch((err: any) => deps.logger.debug({ err: err.message }")).toBe(false);
  });

  it("UPDATE 失败时记 error log", () => {
    const updateIdx = src.indexOf("memoryInjectedIds.length > 0");
    const block = src.substring(updateIdx, updateIdx + 1500);
    expect(block).toMatch(/deps\.logger\.error/);
  });

  it("UPDATE 0 rows 时记 warn log", () => {
    const updateIdx = src.indexOf("memoryInjectedIds.length > 0");
    const block = src.substring(updateIdx, updateIdx + 1500);
    expect(block).toMatch(/deps\.logger\.warn/);
    expect(block).toMatch(/rowCount.*=== 0/);
  });
});

describe("commit 7: ILIKE 排序统一 hit_count 优先", () => {
  const storeSrc = readFileSync("src/memory-engine/storage/postgres-store.ts", "utf-8");

  it("retrieve() DB 层 orderBy 第一个字段是 hitCount DESC", () => {
    // 找 retrieve 函数的 orderBy 行 (line 58, 用 desc(memories.hitCount) 开头)
    const orderByLine = storeSrc.split("\n").find((l) => l.includes(".orderBy(") && l.includes("memories.hitCount") && l.includes("memories.confidence"));
    expect(orderByLine).toBeDefined();
    const hitIdx = orderByLine!.indexOf("memories.hitCount");
    const confIdx = orderByLine!.indexOf("memories.confidence");
    expect(hitIdx).toBeLessThan(confIdx);
  });

  it("retrieve() app 层 sort 加了 hitCount tiebreaker", () => {
    expect(storeSrc).toMatch(/b\.row\.hitCount \?\? 0\) - \(a\.row\.hitCount \?\? 0\)/);
  });
});

describe("commit 7: retriever.ts 静默吞错改 console.error", () => {
  const retrieverSrc = readFileSync("src/memory-engine/retrieval/retriever.ts", "utf-8");

  it("updateAccess 两处都用 console.error 不用 .catch(() => {})", () => {
    expect(retrieverSrc.includes(".catch(() => {})")).toBe(false);
    const updateAccessLines = retrieverSrc.match(/updateAccess\(r\.memory\.id\)/g) || [];
    expect(updateAccessLines.length).toBe(2);
    const errorLogs = retrieverSrc.match(/console\.error\('\[retriever\] updateAccess failed'/g) || [];
    expect(errorLogs.length).toBe(2);
  });
});
