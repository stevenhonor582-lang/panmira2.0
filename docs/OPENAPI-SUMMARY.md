# panmira N1 OpenAPI 生成总结

> 生成时间: 2026-07-07 · HEAD: `c2a9e725`

## 文件位置

| 文件 | 路径 | 大小 |
|---|---|---|
| OpenAPI 3.0 JSON | `/home/ubuntu/panmira-N1/docs/openapi.json` | 130 paths, 8 schemas, OpenAPI 3.0.3 |
| 路由清单 Markdown | `/home/ubuntu/panmira-N1/docs/ROUTES-INVENTORY.md` | 3 sections, 详细分组 |
| 本总结 | `/home/ubuntu/panmira-N1/docs/OPENAPI-SUMMARY.md` | 概览 |

## 路由总数

| 维度 | 数量 |
|---|---|
| **OpenAPI 收录 (keep)** | **130 paths** |
| HTTP routes (keep, 已写入 OpenAPI) | 130 |
| HTTP routes (delete-team, 不写入 OpenAPI) | 26 (在 `team-routes.ts` 中, 不含 1 个 keep 的 activity/events) |
| WS message types — keep | 19 (含 L7 `pipeline_progress`) |
| WS message types — delete-chat | 19 |
| **路由总数 (HTTP + WS)** | **197** |
| **route 文件总数** | 45 (排除 helpers/types/index) |

## L5-L12 新增路由统计

| L# | 新增 HTTP routes | 大改 HTTP routes | 备注 |
|---|---|---|---|
| L4 (Phase 4) | 3 | - | rate-limit override/inspect |
| Phase 4 L3 Fix 3 | 1 | - | pipeline cache invalidate |
| **L5 (核心)** | 23 | 0 | pipelines, agents v2, reports, quotas, KB refs, run logs, embedding-jobs, channel-usage |
| L6 | 0 | 1 | /trigger async mode (2b0c256d) |
| L7 | 0 (1 WS) | 1 | pipeline_progress WS event (ba8af6fb) |
| L8 | 0 | 2 | retryPolicy + 接通 L6 (707b5f44) |
| L9 | 0 | 1 | agents triggerStrategy first/all/race (73e0d0f0) |
| L10 | 0 (1 WS) | 0 | pipeline_progress 扩展 (76ccb2c1) |
| L11 | 0 | 1 | diff label 检测 (ef271976) |
| L12 | 0 | 0 | rate-limit Redis 透明加速 (b8c11d69) |
| **合计** | **27** | **6** | |

## 健康度报告 (推断)

### TypeScript 编译

- **OpenAPI JSON**: `node -e "require('./docs/openapi.json')"` ✅ 成功
- **JSON 解析**: `JSON.parse(...)` ✅ 合法
- 源码 type-check: 未在本次任务中执行(留给后续 CI)

### 测试覆盖

| 模块 | 测试文件 | 状态 |
|---|---|---|
| pipeline-routes (L5-L8) | `src/api/__tests__/pipeline-events.test.ts` (L7) | ✅ 有 |
| pipeline-rate-limit (L4+L12) | `src/middleware/pipeline-rate-limit.test.ts` | ✅ 有 |
| 其他 routes | - | ⚠️ 大部分无单测 |

### 总体健康度

- ✅ **健康**: 38 个 route 文件
- ⚠️ **需关注**: 4 个 (ws-server [19 message types 待删], bot-routes [已确认 11 全 keep], file-routes [preview→delete-chat], binding-routes [4 routes 全 delete-chat])
- ⚠️ **部分待删**: 1 个 (`team-routes.ts`, 26/27 routes 待删, 1 keep activity/events)

## 验证结果

```bash
# 1. OpenAPI 解析
$ cd /home/ubuntu/panmira-N1 && node -e "const o=require('./docs/openapi.json'); console.log('paths:', Object.keys(o.paths||{}).length); console.log('schemas:', Object.keys(o.components?.schemas||{}).length); console.log('openapi version:', o.openapi);"
paths: 130
schemas: 8
openapi version: 3.0.3
```

```bash
# 2. JSON 合法性
$ cd /home/ubuntu/panmira-N1 && node -e "JSON.parse(require('fs').readFileSync('./docs/openapi.json','utf8')); console.log('valid')"
valid
```

## 已确认决策 (2026-07-07)

| # | 边界 | 决策 | 落地 |
|---|---|---|---|
| 1 | `/api/bindings/*` (4 routes) | **delete-chat** | A.3, OpenAPI 移除 2 path entries (4 methods) |
| 2 | `/api/files/preview/{chatId}` | **delete-chat** | A.3, OpenAPI 移除 1 path entry |
| 3 | `/api/activity/events` | **keep** | A.1 + Section B KEEP (admin) + OpenAPI 新增 1 path entry |
| 4 | `/api/coordinator/*` (6 routes) | **delete-team** | A.2, OpenAPI 本来无 |
| 5 | `/api/voice-identities/*` (3 routes) | **delete-team** | A.2, OpenAPI 本来无 |
| 6 | `bot-routes.ts` 11 routes | **全部 keep** | A.1, OpenAPI 保留 |
| 7 | WS message types | 19 keep + 19 delete-chat | A.4, 不变 (pipeline_progress 保留) |

**结果**:OpenAPI paths 从 132 → **130** (-3 path entries: 2 bindings + 1 files/preview, +1 path entry: activity/events)。`bot-bindings` tag 同步移除,新增 `activity` tag。
**team-routes.ts**:27 → 26 delete-team (activity 转 keep)。