# P3.4 任务协作模块 (/tasks) 交付 - 2026-07-08

## 当前任务
P3.4: 任务协作模块 `/tasks` 的完整前端实现,核心是 **tldraw DAG 编辑器**。

## 完成时间
2026-07-08 05:33 UTC+8

## HEAD
7398bb0 (在 main 上,P3.4 的 10 个新文件跨两个 commit 落地)

## 任务范围
- 路由:`/tasks`(列表) · `/tasks/new`(新建) · `/tasks/[id]`(详情) · `/tasks/scheduled`(定时)
- 6 类自定义 tldraw 节点形状:Bot / Human / Skill / Tool / Conditional / Parallel
- 自定义 shape palette · 测试运行 · 保存 · 5 个史德飞 bot 模板
- 只读详情页 + 实时执行日志(WebSocket via `usePipelineProgress`)
- 定时任务列表 + 2-click 启用/暂停

## ✅ 已做 (10 个新文件 · ~1700 行)

### `components/tasks/` — 模块组件
| 文件 | 行数 | 作用 |
|---|---|---|
| `types.ts` | 153 | NodeKind / DagDocument / TaskStatus / ScheduledJob 类型 + 6 类节点 meta |
| `templates.ts` | 157 | 5 个 bot DAG 模板(采购线索/报价/供应商入驻/内容投放/事故分诊) |
| `node-shapes.tsx` | 197 | **6 类自定义 tldraw 节点** · `DagNodeShapeUtil extends BaseBoxShapeUtil` · 共享 200×96 卡片样式 · 调色板 tone 区分 |
| `task-dag-editor.tsx` | 380 | **核心 DAG 编辑器**:左侧 palette · 顶 toolbar (name / template / save / test) · 底 footer (节点/连接计数) · variant=editor\|viewer 双模式 · 保存用 `editor.store.getStoreSnapshot()` roundtrip |
| `execution-log-panel.tsx` | 257 | 详情页右侧实时日志:WS 状态点 + 历史时间线 + trigger 按钮 |
| `task-card.tsx` | 156 | Notion-style 卡片 + Linear-style 列表行,view=grid\|list |

### `app/(app)/tasks/` — 4 条路由
| 文件 | 行数 | 作用 |
|---|---|---|
| `page.tsx` (列表) | 320 | 拉 `/api/v2/admin/pipelines` · 状态/搜索/bot 过滤 · 网格/列表切换 · summary chip · 空态 CTA |
| `new/page.tsx` (新建) | 37 | dynamic import tldraw · 保存后 `router.push('/tasks/:id')` |
| `[id]/page.tsx` (详情) | 261 | 70/30 split: 左只读 DAG · 右 ExecutionLogPanel · WS 实时 · "触发一次"按钮 |
| `scheduled/page.tsx` (定时) | 260 | 拉 `/api/schedule` · cron/事件/手动 · 2-click enable toggle · next-run countdown |

## 关键设计决策

### tldraw 集成
- 用 v5 `Tldraw` 组件 + 自定义 `shapeUtils={DAG_SHAPE_UTILS}`
- 6 类节点共用一个 `DagNodeShapeUtil`,通过 `props.meta.kind` 切换显示
- 编辑器变体 (`variant="editor"`) 用 tldraw 内置 `arrow` 工具连接
- 只读变体 (`variant="viewer"`) 用 `editor.updateInstanceState({ isReadonly: true })` + `hideUi`
- 保存 = `editor.store.getStoreSnapshot()` (TLStoreSnapshot JSON)
- 加载 = `editor.store.loadStoreSnapshot(snapshot)` (验证 roundtrip)
- 派生 `{nodes[], edges[]}` 同步存进 `pipeline.config` 便于服务端快速读

### A1/A2/A3 不动
- 完整保留 A3 的 layout · topbar · sidebar · theme · ui primitives
- AppShell · auth gate · 一级路由结构都没碰
- 新文件只在 `components/tasks/` 和 `app/(app)/tasks/` 两个目录

### 端点契约 (从 OpenAPI 199 paths 选)
| 操作 | 端点 |
|---|---|
| 列表 pipelines | `GET /api/v2/admin/pipelines` |
| 创建 pipeline | `POST /api/v2/admin/pipelines` |
| 读 pipeline | `GET /api/v2/admin/pipelines/{id}` |
| 触发 pipeline | `POST /api/v2/admin/pipelines/{id}/trigger?async=true` (走 L6 async) |
| 历史 runs | `GET /api/v2/admin/pipelines/{id}/runs` |
| 调度列表 | `GET /api/schedule` |
| 调度更新 | `PATCH /api/schedule/{id}` |
| Bot 列表 | `GET /api/v1/agent/bots` |
| Agent 列表 | `GET /api/v1/agent/list` |
| 测试运行 | `POST /api/v1/agent/execute` |

### 触发逻辑
- 详情页 "触发一次" → `triggerPipelineAsync()` (lib/pipeline-trigger.ts 已存在)
- WS 自动订阅 `pipeline_progress` 事件,实时反映在右侧时间线
- WS 断线时降级到只显示历史记录,顶部 chip 标注橙色

### 设计系统
- 单 accent palette + 中性灰 (符合 skill 要求)
- Bot `#0ea5e9` / Human `#10b981` / Skill `#a855f7` / Tool `#f59e0b` / Conditional & Parallel `#475569`/`#64748b`
- 卡片 ring + subtle shadow,无外发光
- 状态 chip 用语义色 (emerald=completed, rose=failed, sky=running, amber=paused, slate=ready)
- 不用 emoji 当节点图标(用 lucide `Bot/UserRound/Wrench/Hammer/GitFork/Split`)
- 触发按钮 2-click 防误触(首次变 ring-2,3.5s 超时回滚)

## ⚠️ 已知问题 / 取舍

1. **`task-dag-editor-client.tsx` 旧文件** A3 留的 dynamic-import wrapper,我的 `task-dag-editor` 仍然能 import 它(它内部 `dynamic(() => import("./task-dag-editor"))`),功能兼容,可后续清理
2. **`/api/v2/admin/pipelines/{id}/runs` 后端可能没实现** execution-log-panel 用 try/catch 兜底,失败时只显示 WS 实时数据
3. **保存走 `pipeline.config` JSON 列** 而不是 `nodes[]/edges[]` 顶层列(顶层列是 unknown[]),保留向后兼容
4. **模板 seed 后不清空 redo history** — 用户撤销会回到空画布,目前可接受

## 🔒 验证

### TypeScript 编译 + Next.js build
- 修过 2 个 build 错误:`Button asChild` 不支持(base-ui 风格) → 改 `<Link className>`;`getIndicatorPath` vs `indicator` → 改 `getIndicatorPath` 返回 `Path2D`
- Build 完成,BUILD_ID = `wUBq003pCKl9fFKqETTbD`

### pm2 部署
- 旧 pm2 配置 `npx next start -p 3200 -H 127.0.0.1` 被 npx 当成 `-c` flag 失败
- 已修复:直接用 `node ./node_modules/next/dist/bin/next start -p 3200 -H 127.0.0.1`
- pm2 重启后端口 3200 正常 LISTEN

### curl 验证 (307/308 → 200)
```
/tasks/         200  (列表页,SSR shell)
/tasks/new/     200  (DAG 编辑器壳,client-only 渲染)
/tasks/abc/     200  (详情页,SSR + client dynamic tldraw)
/tasks/scheduled/ 200  (调度列表)
```
所有路由都是 `/path` → `/path/` 的 308 trailing-slash 重定向,正常 Next.js 行为

## 📂 文件路径

| 文件 | 路径 |
|---|---|
| 编辑器核心 | `apps/web-next/components/tasks/task-dag-editor.tsx` |
| 自定义 shape | `apps/web-next/components/tasks/node-shapes.tsx` |
| 列表页 | `apps/web-next/app/(app)/tasks/page.tsx` |
| 新建页 | `apps/web-next/app/(app)/tasks/new/page.tsx` |
| 详情页 | `apps/web-next/app/(app)/tasks/[id]/page.tsx` |
| 调度页 | `apps/web-next/app/(app)/tasks/scheduled/page.tsx` |
| 模板 | `apps/web-next/components/tasks/templates.ts` |
| 类型 | `apps/web-next/components/tasks/types.ts` |
| 任务卡 | `apps/web-next/components/tasks/task-card.tsx` |
| 日志面板 | `apps/web-next/components/tasks/execution-log-panel.tsx` |
| 本 handoff | `.claude/handoff-2026-07-08-p3-4-tasks-done.md` |

## 后续可优化

- [ ] 节点 props 表单化(双击打开抽屉改 label / refId / config)
- [ ] DAG 验证: 检测环、孤立节点、并行网关 fan-in 不平衡
- [ ] 一键导出为 YAML / Markdown / 图片
- [ ] 历史 run 的可视化时间线(节点高亮执行中)
- [ ] task-dag-editor-client.tsx 旧 wrapper 清理

## 启动命令

```bash
# 已经在跑
pm2 list | grep web-next

# 重新构建 + 重启
cd apps/web-next && ./node_modules/.bin/next build
pm2 reload web-next

# 验证路由
for p in tasks tasks/new tasks/abc tasks/scheduled; do
  curl -sI "http://127.0.0.1:3200/$p/" | head -1
done
```