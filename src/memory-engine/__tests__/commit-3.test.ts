// 2026-06-27 commit 3 静态检查
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 3: postgres-store RAG filters", () => {
  const store = readFileSync("src/memory-engine/storage/postgres-store.ts", "utf-8");
  const retriever = readFileSync("src/memory-engine/retrieval/retriever.ts", "utf-8");

  it("B14: retrieve() 加 botId 参数", () => {
    expect(store).toMatch(/async retrieve\(\s*query: string,\s*userId: string,\s*botId\?: string/);
  });

  it("B14: botId 过滤条件存在", () => {
    expect(store).toMatch(/botId \? eq\(memories\.botId, botId\) : sql/);
  });

  it("B15: 过滤 invalidated memory", () => {
    expect(store).toMatch(/memories\.invalidatedAt.*IS NULL/);
  });

  it("B15 quality gate: confidence >= 0.5", () => {
    expect(store).toMatch(/memories\.confidence.*>= 0\.5/);
  });

  it("B16: 用 confidence 排序", () => {
    expect(store).toMatch(/desc\(memories\.confidence\), desc\(memories\.hitCount\)/);
  });

  it("B17: 默认 layer 包含 AGENT (layer 2)", () => {
    expect(store).toMatch(/MemoryLayer\.RAW, MemoryLayer\.USER, MemoryLayer\.AGENT, MemoryLayer\.SHARED/);
  });

  it("B17: retriever 默认搜全 layer", () => {
    expect(retriever).toMatch(/MemoryLayer\.RAW, MemoryLayer\.USER, MemoryLayer\.AGENT, MemoryLayer\.SHARED/);
  });

  it("B18: updateAccess 真正写 hit_count", () => {
    expect(store).toMatch(/hitCount: sql/);
  });

  it("retriever 透传 botId", () => {
    expect(retriever).toMatch(/this\.storage\.retrieve\(text, userId, botId, opts\)/);
    expect(retriever).toMatch(/this\.storage\.retrieveVector\(embedding, userId, botId, opts\)/);
  });
});
