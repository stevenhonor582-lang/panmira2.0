// 2026-06-27 commit 5 静态检查
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";

describe("commit 5: RAG 监控 + 飞书告警", () => {
  const v018up = existsSync("db/migrations/V018__add_rag_query_log.up.sql")
    ? readFileSync("db/migrations/V018__add_rag_query_log.up.sql", "utf-8")
    : "";
  const v018down = existsSync("db/migrations/V018__add_rag_query_log.down.sql")
    ? readFileSync("db/migrations/V018__add_rag_query_log.down.sql", "utf-8")
    : "";
  const monitor = readFileSync("scripts/monitor-extraction.mjs", "utf-8");
  const kf = readFileSync("src/bridge/knowledge-fetcher.ts", "utf-8");

  it("V018: up.sql 创建 rag_query_log 表", () => {
    expect(v018up).toMatch(/CREATE TABLE IF NOT EXISTS rag_query_log/);
    expect(v018up).toMatch(/top_score real/);
    expect(v018up).toMatch(/bot_name text/);
  });

  it("V018: 视图 v_rag_top_score_p50 存在", () => {
    expect(v018up).toMatch(/CREATE OR REPLACE VIEW v_rag_top_score_p50/);
    expect(v018up).toMatch(/PERCENTILE_CONT/);
  });

  it("V018: down.sql 能回滚", () => {
    expect(v018down).toMatch(/DROP TABLE IF EXISTS rag_query_log/);
  });

  it("V018: 索引", () => {
    expect(v018up).toMatch(/idx_rag_query_log_created/);
    expect(v018up).toMatch(/idx_rag_query_log_bot/);
  });

  it("knowledge-fetcher 写 rag_query_log", () => {
    expect(kf).toMatch(/INSERT INTO rag_query_log/);
  });

  it("monitor 监控 RAG topScore P50", () => {
    expect(monitor).toMatch(/RAG topScore P50/);
    expect(monitor).toMatch(/PERCENTILE_CONT/);
  });

  it("monitor 监控 RAG 失败数", () => {
    expect(monitor).toMatch(/RAG extraction failures/);
  });
});
