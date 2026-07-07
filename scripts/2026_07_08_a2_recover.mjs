#!/usr/bin/env node
/**
 * panmira A2 — 数据完整性验证脚本
 * 2026-07-08
 *
 * 用途:
 *   1. 检查 5 张核心表 count 是否合理
 *   2. 检查 4 个 IA v6 view count 是否匹配
 *   3. 检查 A2 新字段是否补齐 + enum 约束生效
 *   4. 输出 markdown 报表到 .claude/a2-data-report.md
 *
 * 使用: node scripts/2026_07_08_a2_recover.mjs
 */

import { Client } from 'pg';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(__dirname, '..', '.claude', 'a2-data-report.md');

const DB_URL = process.env.DATABASE_URL || 'postgresql://ubuntu:ubuntu@localhost:5432/metabot';

const CHECKS = [
  // ---- 1. 5 张核心表 count ----
  {
    group: 'core_tables',
    name: 'agents',
    sql: `SELECT count(*) AS n FROM agents`,
    expect: 8,
    note: '数字员工 (含历史 full-stack-engineer 模板)',
  },
  {
    group: 'core_tables',
    name: 'users',
    sql: `SELECT count(*) AS n FROM users`,
    expect: 2,
    note: '真人 (admin@panmira.com 已就位)',
  },
  {
    group: 'core_tables',
    name: 'agent_pipelines',
    sql: `SELECT count(*) AS n FROM agent_pipelines`,
    expect: 13,
    note: '流水线 (含 e2e/test 系列)',
  },
  {
    group: 'core_tables',
    name: 'documents',
    sql: `SELECT count(*) AS n FROM documents`,
    expect: 2526,
    note: '知识库文档',
  },
  {
    group: 'core_tables',
    name: 'bot_configs',
    sql: `SELECT count(*) AS n FROM bot_configs`,
    expect: 5,
    note: '飞书 channel binding (玄鉴/守静/信言/得一/不盈)',
  },

  // ---- 2. 4 个 IA v6 view count ----
  {
    group: 'views',
    name: 'digital_employees',
    sql: `SELECT count(*) AS n FROM digital_employees`,
    expect: 8,
    note: '应 == agents',
  },
  {
    group: 'views',
    name: 'people',
    sql: `SELECT count(*) AS n FROM people`,
    expect: 2,
    note: '应 == users',
  },
  {
    group: 'views',
    name: 'model_pool',
    sql: `SELECT count(*) AS n FROM model_pool`,
    expect: 5,
    note: '应 == provider_configs',
  },
  {
    group: 'views',
    name: 'endpoints',
    sql: `SELECT count(*) AS n FROM endpoints`,
    expect: 5,
    note: '应 == bot_configs',
  },

  // ---- 3. A2 新字段 enum 校验 ----
  {
    group: 'enums',
    name: 'agents.status',
    sql: `SELECT count(*) AS n FROM agents WHERE status NOT IN ('active','paused','deprecated')`,
    expect: 0,
    note: 'enum 校验: 0 表示全部合法',
  },
  {
    group: 'enums',
    name: 'agent_pipelines.status',
    sql: `SELECT count(*) AS n FROM agent_pipelines WHERE status NOT IN ('active','paused','archived')`,
    expect: 0,
    note: 'enum 校验',
  },
  {
    group: 'enums',
    name: 'documents.module',
    sql: `SELECT count(*) AS n FROM documents WHERE module NOT IN ('knowledge','feedback','log','other')`,
    expect: 0,
    note: 'enum 校验',
  },
  {
    group: 'enums',
    name: 'bot_configs.purpose',
    sql: `SELECT count(*) AS n FROM bot_configs WHERE purpose NOT IN ('outbound','inbound','both')`,
    expect: 0,
    note: 'enum 校验',
  },

  // ---- 4. 字段存在性校验 (信息性, expect=null 表示不检查值) ----
  {
    group: 'fields',
    name: 'agents.persona (not null count)',
    sql: `SELECT count(*) AS n FROM agents WHERE persona IS NOT NULL AND persona <> ''`,
    expect: null,
    note: 'persona 回填情况',
  },
  {
    group: 'fields',
    name: 'agents.avatar_url (not null count)',
    sql: `SELECT count(*) AS n FROM agents WHERE avatar_url IS NOT NULL AND avatar_url <> ''`,
    expect: null,
    note: 'avatar_url 回填情况',
  },
  {
    group: 'fields',
    name: 'agent_pipelines.owner_id (not null count)',
    sql: `SELECT count(*) AS n FROM agent_pipelines WHERE owner_id IS NOT NULL`,
    expect: null,
    note: 'owner_id 回填情况 (从 created_by)',
  },
  {
    group: 'fields',
    name: 'users.sid (not null count)',
    sql: `SELECT count(*) AS n FROM users WHERE sid IS NOT NULL AND sid <> ''`,
    expect: null,
    note: 'sid 编号回填 (A1 已加)',
  },
];

function fmtNum(n) {
  return n === null ? '-' : String(n);
}

function statusIcon(passed, isInfo) {
  if (isInfo) return 'INFO';
  return passed ? 'PASS' : 'FAIL';
}

async function main() {
  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  console.log(`[A2] connecting to ${DB_URL.replace(/:[^:@/]+@/, ':***@')}`);
  console.log(`[A2] running ${CHECKS.length} checks...\n`);

  const results = [];
  let passCount = 0;
  let failCount = 0;
  let infoCount = 0;

  for (const check of CHECKS) {
    const r = await client.query(check.sql);
    const n = Number(r.rows[0].n);
    const isInfo = check.expect === null;
    const passed = isInfo ? true : n === check.expect;

    if (isInfo) infoCount++;
    else if (passed) passCount++;
    else failCount++;

    results.push({ ...check, actual: n, passed, isInfo });
    console.log(
      `[${statusIcon(passed, isInfo)}] ${check.group.padEnd(12)} ${check.name.padEnd(38)} ` +
      `actual=${fmtNum(n)} expect=${fmtNum(check.expect)}`,
    );
  }

  // ---- 跨表/视图 sanity 检查 ----
  console.log('\n[A2] cross-table sanity:');
  const sanity = await client.query(`
    SELECT
      (SELECT count(*) FROM agents)              AS agents,
      (SELECT count(*) FROM digital_employees)   AS digital_employees,
      (SELECT count(*) FROM users)               AS users,
      (SELECT count(*) FROM people)              AS people,
      (SELECT count(*) FROM bot_configs)         AS bot_configs,
      (SELECT count(*) FROM endpoints)           AS endpoints,
      (SELECT count(*) FROM provider_configs)    AS provider_configs,
      (SELECT count(*) FROM model_pool)          AS model_pool
  `);
  const s = sanity.rows[0];
  const sanityChecks = [
    ['agents == digital_employees', s.agents === s.digital_employees],
    ['users == people',             s.users === s.people],
    ['bot_configs == endpoints',    s.bot_configs === s.endpoints],
    ['provider_configs == model_pool', s.provider_configs === s.model_pool],
  ];
  sanityChecks.forEach(([k, ok]) => console.log(`  ${ok ? 'OK' : 'FAIL'}  ${k}`));

  await client.end();

  // ---- 写 markdown 报表 ----
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const lines = [];
  lines.push('# panmira A2 数据完整性报表');
  lines.push('');
  lines.push(`> 生成时间: ${now}`);
  lines.push(`> 脚本: scripts/2026_07_08_a2_recover.mjs`);
  lines.push('');
  lines.push('## 0. 结论');
  lines.push('');
  lines.push(`- PASS: **${passCount}**`);
  lines.push(`- FAIL: **${failCount}**`);
  lines.push(`- INFO: **${infoCount}**`);
  lines.push(`- 跨表一致性: **${sanityChecks.every(c => c[1]) ? 'OK' : 'FAIL'}**`);
  lines.push('');

  lines.push('## 1. 核心表 count (5)');
  lines.push('');
  lines.push('| 表 | 实际 | 期望 | 状态 | 备注 |');
  lines.push('|---|------|------|------|------|');
  for (const r of results.filter(r => r.group === 'core_tables')) {
    lines.push(`| ${r.name} | ${r.actual} | ${r.expect} | ${statusIcon(r.passed, r.isInfo)} | ${r.note} |`);
  }
  lines.push('');

  lines.push('## 2. IA v6 view count (4)');
  lines.push('');
  lines.push('| view | 实际 | 期望 | 状态 | 备注 |');
  lines.push('|------|------|------|------|------|');
  for (const r of results.filter(r => r.group === 'views')) {
    lines.push(`| ${r.name} | ${r.actual} | ${r.expect} | ${statusIcon(r.passed, r.isInfo)} | ${r.note} |`);
  }
  lines.push('');

  lines.push('## 3. Enum 约束校验');
  lines.push('');
  lines.push('| 字段 | 非法值数量 | 期望 | 状态 |');
  lines.push('|------|-----------|------|------|');
  for (const r of results.filter(r => r.group === 'enums')) {
    lines.push(`| ${r.name} | ${r.actual} | ${r.expect} | ${statusIcon(r.passed, r.isInfo)} |`);
  }
  lines.push('');

  lines.push('## 4. 字段回填情况 (INFO)');
  lines.push('');
  lines.push('| 字段 | 非空数量 | 备注 |');
  lines.push('|------|---------|------|');
  for (const r of results.filter(r => r.group === 'fields')) {
    lines.push(`| ${r.name} | ${r.actual} | ${r.note} |`);
  }
  lines.push('');

  lines.push('## 5. 跨表一致性 (view 应该 == 底层表)');
  lines.push('');
  lines.push('| 校验项 | 状态 |');
  lines.push('|--------|------|');
  for (const [k, ok] of sanityChecks) {
    lines.push(`| ${k} | ${ok ? 'OK' : 'FAIL'} |`);
  }
  lines.push('');

  lines.push('## 6. 原始数据');
  lines.push('');
  lines.push('```');
  for (const r of results) {
    lines.push(`[${statusIcon(r.passed, r.isInfo)}] ${r.group}/${r.name}: actual=${r.actual} expect=${fmtNum(r.expect)} -- ${r.note}`);
  }
  lines.push('```');
  lines.push('');

  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8');
  console.log(`\n[A2] report written to: ${REPORT_PATH}`);
  console.log(`[A2] summary: PASS=${passCount} FAIL=${failCount} INFO=${infoCount}`);

  // 退出码: failCount > 0 退出 1
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[A2] FATAL:', err);
  process.exit(2);
});
