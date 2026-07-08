# Q1 数据真实性巡检 · 完成

> 时间: 2026-07-08
> HEAD: `fb3cc4f` (P1 收尾)
> 状态: 巡检 + SQL + transition + reports 全部完成,等待用户决策

---

## 已完成

- [x] **DB 巡检脚本** `scripts/2026_07_08_q1_data_audit.sql` (183 行)
- [x] **DB 巡检报告** `.claude/q1-data-report.md` (236 行)
- [x] **SQL 补全脚本** `migrations/2026_07_08_q1_real_data.sql` (342 行,**未跑**)
- [x] **前端接真数据 transition plan** `.claude/q1-real-data-transition.md` (153 行)
- [x] **Q1 最终汇总** `.claude/q1-final.md` (227 行)

---

## 核心数字

| 表 | total | realness |
|----|-------|--------|
| agents | 8 | 75% (avatar 是占位符 / default_model NULL) |
| users | 5 | 60% (phone 缺) |
| agent_pipelines | 13 | 50% (11/13 desc 空) |
| documents | 2526 | 97% (81 orphan) |
| kb / providers / bots / folders | 12 / 5 / 5 / 98 | 100% |

**综合真实度: 6.4/10 (Q1 修完预计 7.7/10)**

---

## 用户必须决策(10 项)

详见 `q1-final.md` §5 ⚠️。重点:
1. `agents.default_model` 绑哪个 provider
2. 3 个测试残留 agents 删除还是保留
3. 11 pipelines 缺 description 自动补 vs 人工
4. `documents` 81 orphan 怎么分
5. `users.phone` 何时补
6. `people_profile_extended` 何时填
7. `audit_logs` 全 0 是 bug 吗
8. `kb chunks` 22/2524 是否重 embed
9. `e2e-test-member` 是否保留
10. `pipelines` 是否加 schedule 列

---

## 重跑命令

```bash
PGPASSWORD=ubuntu /usr/lib/postgresql/16/bin/psql -h localhost -U ubuntu -d metabot \
  -f /home/ubuntu/panmira-N1/scripts/2026_07_08_q1_data_audit.sql
```

---

## 下一步

用户决策 → 改 ROLLBACK → COMMIT → 跑 SQL → Q2 API 端点 → Q3 E2E
