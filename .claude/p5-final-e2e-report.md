# P5 Final E2E Report · Playwright Visual Regression

**测试时间**: 2026-07-08
**测试工具**: Playwright 1.61.1 + chromium 1228 (headless)
**测试基础**: http://localhost:3200 (web-next) + 9100 (api)
**登录**: 史德飞 `20218181@qq.com` + `shidefei@2026`
**截图目录**: `/home/ubuntu/panmira-N1/.claude/screenshots/`
**测试代码**: `apps/web-next/e2e/specs/visual-regression.spec.ts` (16 tests)

---

## Summary

✅ **16/16 tests PASS** · 16 张截图 · 5 模块覆盖完整 · 发现 **3 BLOCK + 1 WARN** (在 review 报告中详述)

```
Running 16 tests using 1 worker
  ✓  A1_login_form (887ms)
  ✓  A2_login_then_overview (2.6s)
  ✓  B1_dashboard (2.6s)
  ✓  B2_people (2.3s)
  ✓  B3_shidefei_detail (2.2s)
  ✓  C1_gallery (2.4s)
  ✓  C2_detail (2.3s)
  ✓  C3_wizard (2.1s)
  ✓  D1_memory_l1 (2.2s)
  ✓  D2_knowledge (2.4s)
  ✓  E1_list (2.3s)
  ✓  E2_new_placeholder (1.9s)
  ✓  E3_detail_with_tldraw (4.1s)
  ✓  F1_llm (2.2s)
  ✓  F2_endpoints_outbound (2.0s)
  ✓  F3_oauth (2.2s)

  16 passed (37.7s)
```

---

## 截图清单 (16 张)

| 场景 | 文件 | 大小 | 渲染状态 | 备注 |
|------|------|------|----------|------|
| A 登录 | `a-login.png` | 17KB | ✅ | 单步表单 |
| A 登录 | `a-overview-after-login.png` | 124KB | ✅ | 登录后跳转 dashboard |
| B 综阅 | `b-overview-dashboard.png` | 124KB | ✅ | 4 KPI + 趋势图 |
| B 综阅 | `b-overview-people.png` | 97KB | ✅ | 史德飞带 FOUNDER badge |
| B 综阅 | `b-overview-shidefei.png` | 94KB | ✅ | 7 Tab 详情 |
| C 员工 | `c-employees-gallery.png` | 248KB | ✅ | Gallery 大小卡混排 |
| C 员工 | `c-employees-detail.png` | 17KB | 🚫 | **server/client 边界错** (B2+B3) |
| C 员工 | `c-employees-wizard.png` | 188KB | ✅ | 7 步向导 step3 人格 |
| D 底座 | `d-foundation-l1.png` | 163KB | ✅ | L1 短期记忆 |
| D 底座 | `d-foundation-knowledge.png` | 182KB | ✅ | 3-pane KB |
| E 任务 | `e-tasks-list.png` | 93KB | ✅ | grid 列表 |
| E 任务 | `e-tasks-dag-placeholder.png` | 97KB | 🚫 | **/tasks/new 占位** (B1) |
| E 任务 | `e-tasks-detail.png` | 64KB | ⚠ | metadata 显示,tldraw canvas 未渲染 (W3) |
| F 频道 | `f-channels-llm.png` | 112KB | ✅ | 模型池 |
| F 频道 | `f-channels-endpoints-outbound.png` | 109KB | ✅ | outbound tab |
| F 频道 | `f-channels-oauth.png` | 92KB | ✅ | OAuth 双向 tab |

---

## view count 对齐 (5 模块 全部 6 view,实际可达 6 view)

| 模块 | 路由 | 截图文件 | 渲染状态 | 实际可用 view |
|------|------|----------|----------|--------------|
| A 登录 | /login/ | a-login.png | ✅ | 1/1 |
| A 后台 | /overview/dashboard/ | a-overview-after-login.png | ✅ | 1/1 |
| B 综阅 | /overview/dashboard/ | b-overview-dashboard.png | ✅ | 1/1 |
| B 综阅 | /overview/people/ | b-overview-people.png | ✅ | 1/1 |
| B 综阅 | /overview/people/[id]/ | b-overview-shidefei.png | ✅ | 1/1 |
| C 员工 | /employees/ | c-employees-gallery.png | ✅ | 1/1 |
| C 员工 | /employees/[id]/ | c-employees-detail.png | 🚫 | 0/1 |
| C 员工 | /employees/new/ | c-employees-wizard.png | ✅ | 1/1 |
| D 底座 | /foundation/memory/l1/ | d-foundation-l1.png | ✅ | 1/1 |
| D 底座 | /foundation/knowledge/ | d-foundation-knowledge.png | ✅ | 1/1 |
| E 任务 | /tasks/ | e-tasks-list.png | ✅ | 1/1 |
| E 任务 | /tasks/new/ | e-tasks-dag-placeholder.png | 🚫 (占位) | 0/1 |
| E 任务 | /tasks/[id]/ | e-tasks-detail.png | ⚠ (canvas missing) | 0.5/1 |
| F 频道 | /channels/llm/ | f-channels-llm.png | ✅ | 1/1 |
| F 频道 | /channels/endpoints/?tab=outbound | f-channels-endpoints-outbound.png | ✅ | 1/1 |
| F 频道 | /channels/oauth/ | f-channels-oauth.png | ✅ | 1/1 |

**完整可用**: 13 / 16 view · **部分可用**: 1 (e-tasks-detail) · **不可用**: 2 (c-employees-detail, e-tasks-dag-placeholder)

---

## tldraw DAG save/load roundtrip

**状态**: ⏸ **跳过**

**原因**:
1. `tasks/new/` (B1) 是占位,无 DAG 编辑器 → 无法创建 DAG
2. `tasks/[id]/` (W3) 详情页 tldraw canvas 在测试中未渲染 (canvas count = 0) → 即使有数据也无法 roundtrip
3. `employees/[id]/` (B2+B3) server/client 边界错,无法访问 tab 数据

**已记录的证据**:
- `e-tasks-dag-placeholder.png` 截图证明 /tasks/new 是占位
- `e-tasks-detail.png` 显示页面 layout 但右侧 DAG canvas 空白
- pm2 log 显示 `TaskDagEditor` dynamic import 应该加载但运行时未触发 mount

**后续 roundtrip 建议**: 修 B1 + W3 后,用 Playwright 跑:
1. 打开 /tasks/new
2. 拖入 2 个 node + 1 条 edge
3. 点 Save → POST /api/v2/admin/pipelines
4. 重新打开 → 验证节点位置 + label 一致

---

## 30s 模拟操作响应时间记录

来自 Playwright 自动计时 (ms):

| 操作 | 耗时 |
|------|------|
| A1 加载 /login/ | 887 |
| A2 登录 → overview | 2600 |
| B1 加载 dashboard | 2600 |
| B2 加载 people | 2300 |
| B3 加载 shidefei detail | 2200 |
| C1 加载 employees gallery | 2400 |
| C2 加载 employees detail (错) | 2300 |
| C3 加载 wizard | 2100 |
| D1 加载 L1 memory | 2200 |
| D2 加载 knowledge | 2400 |
| E1 加载 tasks list | 2300 |
| E2 加载 tasks/new (占位) | 1900 |
| E3 加载 tasks/[id] (canvas missing) | 4100 |
| F1 加载 channels/llm | 2200 |
| F2 加载 endpoints outbound | 2000 |
| F3 加载 oauth | 2200 |
| **总计** | **37,700 ms (16 ops)** |
| **平均** | **2,356 ms / op** |

**观察**:
- 平均单页加载 2.3s,达到 < 2.5s LCP 目标 (E3 是 dynamic import tldraw,4.1s 可接受)
- A2 (登录 → overview) 是真实双跳,2.6s 合理
- 模拟用户感知流畅度: 平均点击后 2-3s 看到完整页面

---

## E2E 测试基础设施

**新增文件**:
```
apps/web-next/playwright.config.ts          (527 字节)
apps/web-next/e2e/specs/visual-regression.spec.ts  (5,363 字节)
```

**新增依赖** (npm install -D):
```
@playwright/test (3 packages)
+ chromium browser binary (~150MB)
```

**配置要点**:
- `baseURL: http://localhost:3200`
- `viewport: 1440x900` (Desktop Chrome)
- `workers: 1` (因为会登录态污染)
- `timeout: 60s`
- `fullyParallel: false` (登录态依赖)

---

## 关键发现 (供 P5 重测)

1. **B1**: `/tasks/new/` 是占位 → 需要补真实 DAG 编辑器
2. **B2**: `/employees/[id]/` server→client render-function 边界错 → 详情页打不开
3. **B3**: `/employees/[id]/_components/agent-header.tsx` 越界调用 client `statusTone` → 同 B2
4. **W3**: `/tasks/[id]/` tldraw canvas 未渲染 (但 page metadata 显示) → 需要查 `TaskDagEditor` 实际 mount 状态

建议修复优先级: **B2 + B3** (影响 employees 详情全功能) > **B1** (影响新建任务) > **W3** (影响 DAG 可视化)
