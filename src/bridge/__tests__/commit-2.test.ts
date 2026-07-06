// 2026-06-27 commit 2 静态检查测试
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("commit 2: memory-writer 修复", () => {
  const src = readFileSync("src/bridge/memory-writer.ts", "utf-8");

  it("B6: WINDOW_TOKENS 提到 2000", () => {
    expect(src).toMatch(/const WINDOW_TOKENS = 2000/);
  });

  it("B6: WINDOW_STEP 提到 1000", () => {
    expect(src).toMatch(/const WINDOW_STEP = 1000/);
  });

  it("B7: extractSubject 方法已删除", () => {
    expect(src.includes("private async extractSubject")).toBe(false);
  });

  it("B8: v1 dedup SQL 修了多逗号 bug", () => {
    // 找 SET content = $1 那个 dedup SQL 块
    const idx = src.indexOf("hit_count = hit_count + 1,");
    const block = src.substring(idx, idx + 200);
    expect(block.includes("updated_at = NOW()")).toBe(true);
  });

  it("B8 quality gate 提到 0.6", () => {
    expect(src).toMatch(/if \(confidence < 0\.6\)/);
  });

  it("B7: LLM 失败时不再调用 v1 fallback", () => {
    expect(src.includes("Memory recorded (v1 fallback)")).toBe(false);
    expect(src.includes("LLM extraction failed, skipped memory write")).toBe(true);
  });

  it("B7: LLM 失败时发飞书告警", () => {
    expect(src.includes("PANMIRA_ALERT_WEBHOOK")).toBe(true);
  });
});
