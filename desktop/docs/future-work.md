# Future Work (v0.2+ Backlog)

> 候选端点 / 未来工作清单。从 `decisions.md` §3.5 抽出。
> 当前不在 v0.1 桌面端交付范围内，先 stub，等 v0.2 再讨论优先级与实现。

## 候选端点

| 端点 | 用途 | 优先级 | 备注 |
|------|------|--------|------|
| `POST /api/quality/review` | 服务端留痕的 AI 审查（带证据 + audit log） | P1，v0.2 | v0.1 用 WSS `chat botName: 'lingyan'` 走客户端护栏 |
| `GET /api/quality/reviews/:id` | 取审查报告 | P1，v0.2 | 配合 `POST /api/quality/review` |
| `GET /api/audit/logs?from=&to=` | 审计日志查询 | P2 | 服务端权威审计/留痕场景 |

## 触发条件

- 当客户端 regex + lingyan 二次复核无法满足合规要求（需要服务端留痕 / 不可篡改审计日志）时，把 `POST /api/quality/review` 提到 v0.2 必做。
- 当监管 / 法务要求"所有风险门决策可追溯"时，把 `GET /api/audit/logs` 提到 P1。

## 来源

- 原 `docs/decisions.md` §3.5 (v0.1 backlog)
- `src/skills/skill-registry.ts:538`
- `src/agents/roles/lingyan.ts:14`
- `src/api/routes/task-routes.ts` (无 quality 子路由)
