// 2026-06-27 commit 4 静态检查
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

describe("commit 4: batch-extract-worker", () => {
  const script = existsSync("scripts/batch-extract-worker.mjs")
    ? readFileSync("scripts/batch-extract-worker.mjs", "utf-8")
    : "";
  const eco = readFileSync("ecosystem.config.cjs", "utf-8");
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));

  it("B11: batch-extract-worker.mjs 存在", () => {
    expect(script.length).toBeGreaterThan(0);
  });

  it("B11: 实际调 LLM extractor.extract", () => {
    expect(script).toMatch(/extractor\.extract\(/);
  });

  it("B11: 写入 memory 表", () => {
    expect(script).toMatch(/INSERT INTO memories/);
  });

  it("B12: broken 时 auto-restart panmira", () => {
    expect(script).toMatch(/pm2 restart panmira/);
  });

  it("B13: 飞书告警", () => {
    expect(script).toMatch(/PANMIRA_ALERT_WEBHOOK/);
  });

  it("ecosystem.config.cjs 加了 batch-extract-worker", () => {
    expect(eco).toMatch(/batch-extract-worker/);
  });

  it("package.json 加了 batch-extract script", () => {
    expect(pkg.scripts["batch-extract"]).toBeDefined();
  });
});
