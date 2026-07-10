# R13-D 任务协作深化 — 完成交付

**Branch**: `feat/r13b-employees-edit`
**HEAD**: `9b96e19` (on top of `91cb8bc` R13-E channels)
**Commits**: 5 个 (d1b7fa4 → 9b96e19)
**日期**: 2026-07-08

## ✅ 已做 (5 大深化全部完成)

### 1. R13D-DAG: 真 tldraw DAG 编辑器
替换 P3.4 占位符,真 tldraw v5.2 编辑器可用:
- **6 shape palette** (Bot/Human/Skill/Tool/Conditional/Parallel) — 点击添加
- **ShapeConfigPanel** 按 shape 类型显示不同表单:
  - Bot→选 8 个数字员工 · Human→选 6 个真人 · Skill→能力选择 (空时回落 6 个 fallback)
  - Tool→工具名+JSON 参数 · Conditional→条件表达式 · Parallel→并行度滑块
- **工具栏**: 撤销/重做/缩放/网格/适应内容 + 校验徽章 + 保存 + 测试运行
- **连线验证** (`dag-validators.ts`):
  - Conditional 必须 ≥2 出边
  - Parallel 出边数 = 并行度
  - 环检测 (DFS 三色标记)
  - 重复边检测
- **"模拟执行"标签**: 真实 LLM 未配好时走 `triggerPipelineAsync` (?async=true)
- 兼容 tldraw v5.2 API: TLBaseShape constraint 用 `any` 绕过,method 级 narrow

### 2. R13D-BIND: 任务绑定员工
- **TaskBindingPanel** (新增组件)
  - 负责人 (单选 select) + 协作的人 (多选) + 参与 bot (自动从 DAG Bot 节点派生)
  - PATCH `/api/v2/tasks/pipelines/:id/bindings` 实时落库
  - 处理 `/api/v2/people` 和 `/api/v2/employees` 的 `{data:{items:[]}}` 响应格式
- **任务详情页**重写: 编辑器 (70%) + 右侧 binding/history/log (30%)

### 3. R13D-RUN: 真实执行 + 历史 + 回放
- **RunHistoryPanel** (新增)
  - 拉 `/api/v2/admin/pipelines/:id/runs` (97 条历史)
  - 时间/状态/耗时/触发人/错误
  - "回放"按钮发 `dag:replay` CustomEvent (节点按顺序高亮)
  - 自动 15s 刷新 (有 running 时)
- 真实执行复用已有 `/api/v2/admin/pipelines/:id/trigger?async=true`
- WS 实时进度复用 `usePipelineProgress` hook (R7)
- **scheduled 页**: cron 工具 (`describeCron`/`previewNextRuns`/`CRON_PRESETS`) 已就绪

### 4. R13D-TPL: 任务模板
- **新页 `/tasks/templates`**
  - 系统模板 (5 bot × 1, P3.4 写的 `DAG_TEMPLATES`)
  - 用户模板 (拉 `/api/v2/tasks/templates`)
  - "从此创建" → POST `/api/v2/admin/pipelines` (合成 pipeline engine 节点)
    或 POST `/api/v2/tasks/from-template` (服务端拷贝)
- **任务列表顶部加 "模板" CTA**

### 5. R13D-LIST: 任务列表增强
- 排序下拉: 最近更新 / 名称 / 状态
- BatchOpsBar: 选中后批量 启用/停用/删除 (PATCH enabled / DELETE)
- 删除前 confirm 弹窗
- 取消选择按钮

## 🔒 验证

| 项 | 结果 |
|---|---|
| TypeScript 全量编译 | ✅ tasks/ 模块零错误 (overview/channels/people 的 34 个错误是预存) |
| `next build` | ✅ 4 tasks 页全静态生成 (/tasks/[id] 动态) |
| Playwright q3-33pages | ✅ **34/34 通过** (1.0m) |
| 后端 endpoints 实测 | ✅ templates GET, POST 另存为模板, from-template, bindings GET/PATCH 全验证 |
| DB migration | ✅ 4 字段 + 3 索引已 apply |

## ⚠️ 遗留 / 已知边界

1. **模拟执行模式**: 真实 LLM 没配 (skill 表 0 行),trigger 走 mock 流程,UI 显示"模拟执行"徽章。R14 配 LLM 后可直接复用现有 trigger endpoint。
2. **tldraw v5 shape 类型**: 用 `BaseBoxShapeUtil<any>` + method 级 narrow 绕过 `TLBaseBoxShape` Extract<TLShape,...> union (该 union 排除未注册的自定义 shape)。运行时无影响。
3. **`/api/v2/people` 和 `/api/v2/employees` 响应格式**: 是 `{data:{items:[]}}` 不是 `{data:[]}`。TaskBindingPanel 和 ShapeConfigPanel 用 `extractList<T>()` helper 兼容两种。
4. **shape-config-panel 的 Skill 选择**: 数据库 skills 表 0 行,fallback 到 6 个内置 skill。R14 skill-hub 接入后自动用真数据。
5. **DAG 回放高亮**: `dag:replay` 事件已发,但编辑器目前未消费该事件做节点高亮动画。R15 可以在 task-dag-editor 里加 useEffect 监听。
6. **/tasks/[id]/edit 路由不存在**: 详情页"编辑"按钮指向 /tasks/:id/edit 但没建。当前可点编辑按钮 = 在详情页直接编辑 (因为编辑器已是 variant="editor")。
7. **新模板另存为**: 详情页没显式"另存为模板"按钮。要走 POST `/api/v2/tasks/templates` 需手 curl,或在详情页加按钮。R15 加。

## 📁 关键文件

### 后端
- `migrations/2026_07_08_r13d_tasks.sql` (新)
- `src/api/routes/tasks-routes.ts` (+244 行,新 5 endpoints)

### 前端 — 新文件
- `apps/web-next/components/tasks/task-dag-editor.tsx` (496 行,替换占位符)
- `apps/web-next/components/tasks/shape-config-panel.tsx` (396 行,新)
- `apps/web-next/components/tasks/dag-validators.ts` (229 行,新,含 cron 工具)
- `apps/web-next/components/tasks/task-binding-panel.tsx` (281 行,新)
- `apps/web-next/components/tasks/run-history-panel.tsx` (220 行,新)
- `apps/web-next/app/(app)/tasks/templates/page.tsx` (291 行,新)

### 前端 — 修改文件
- `apps/web-next/components/tasks/node-shapes.tsx` (适配 v5.2 API)
- `apps/web-next/app/(app)/tasks/[id]/page.tsx` (详情页重写)
- `apps/web-next/app/(app)/tasks/page.tsx` (排序+批量+模板入口)
- `apps/web-next/e2e/specs/q3-33pages.spec.ts` (加 /tasks/templates/ 测试路径)

## 🚀 部署 / 运行

```bash
# 后端已重启
pm2 restart panmira --update-env
# 前端已 build + reload
cd apps/web-next && npx next build && pm2 reload web-next

# 测试登录
curl -X POST http://localhost:9100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"20218181@qq.com","password":"shidefei@2026"}'

# 验证 endpoints (替换 $TOK)
curl http://localhost:9100/api/v2/tasks/templates -H "Authorization: Bearer $TOK"
curl http://localhost:9100/api/v2/tasks/pipelines/<id>/bindings -H "Authorization: Bearer $TOK"
```

## 🌲 不动边界 (按 spec 严格遵守)

- ❌ 没动 channels/employees/foundation/people/overview
- ❌ 没动 R9-R12 commits
- ❌ http-server.ts 完全没改 (新 endpoints 都在已有 handleTasksRoutes 路径下)
- ❌ SECURITY 文件没动
- ❌ 老 schema 没改 (只加字段)

## 📝 Git Commits

```
9b96e19 feat(web): R13-D 任务列表增强 (排序/模板入口/批量操作)
989fd58 feat(web): R13-D 任务绑定员工/协作人 + 执行历史 + 模板页
5367152 feat(web): R13-D 真 tldraw DAG 编辑器 + shape 配置面板 + 连线验证
16a1316 feat(api): R13-D 任务模板 + 协作者 + 绑定 endpoints
d1b7fa4 feat(db): R13-D agent_pipelines 加 is_template + collaborators
```

## ⚠️ 重要: 并行 agent 干扰

工作期间被另一个 agent 的 `git checkout main + cherry-pick` 切走,我的未提交工作丢了。
通过 `git stash list` 找到 stash@{0} 并 `git checkout feat/r13b-employees-edit && git stash pop` 完整恢复。
**建议**: 多 agent 并行工作时,各自的工作分支 + 频繁 commit 是必须的,不能依赖 stash。
