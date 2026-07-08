# 会话交接 - 2026-07-09 R17-2 组织部卡片 + 真人详情重构

## 当前任务
R17-2: 修复组织部卡片点不开 + 替换三点菜单为图标行 + 详情页紧凑 + 协作对象说明 + 添加员工独立页。

## 已完成

### 1. 卡片点不开修 ✅
**根因**: `person-card.tsx` 中 `<div>` 包裹整个卡片但**没有 onClick**。可点击元素只有底部的"编辑"Link (line 348)。
- admin 看自己卡片时 `isSelf=true` → `canEdit = !isSelf && ... = false` → 编辑 Link 不渲染
- 结果: admin 自己的卡片**没有任何可点元素**,完全点不开

**修复** (`apps/web-next/app/(app)/overview/_components/person-card.tsx`):
- 整个卡片 `<div>` 加 `onClick` + `role="button"` + `tabIndex={0}` + 键盘支持 (Enter/Space)
- 点击 → `router.push('/overview/people/${id}')` (查看模式)
- 内部按钮区域用 `data-no-card-click` 标记,阻止冒泡
- hover 效果: `-translate-y-0.5` + 阴影增强 + 边框变深

### 2. 三点菜单 → 图标行 ✅
**移除**: `MoreHorizontal` 按钮 + 弹出菜单 + click outside listener
**新增**: `IconAction` 子组件 (图标按钮 + CSS hover tooltip)
- 使用 lucide-react 图标 (Eye/Pencil/Power/PowerOff/RefreshCw/PauseCircle/LogOut/Trash2)
- tooltip 用 `group-hover/icon` CSS 实现,无新依赖 (不用 base-ui Tooltip)
- 每个 tooltip 都有中文标签
- 不同操作不同色: primary (黑)/warn (橙)/danger (红)/default (灰)
- `disabled` 状态显示半透明 + `cursor-not-allowed`
- 同时保留 `title` 属性作为 fallback

### 3. 权限矩阵 (与之前一致,改为图标行展示)
| 用户/目标 | 查看 | 编辑 | 启停 | 重置密码 | 状态切换 | 删除 |
|-----------|------|------|------|---------|---------|------|
| admin → 别人 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(仅 departed) |
| admin → 自己 | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| admin → founder | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| operator → member | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| operator → admin | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| member → 任何人 | ✓ (只读) | ✗ | ✗ | ✗ | ✗ | ✗ |

### 4. 详情页头部紧凑 + tab 行右侧醒目编辑按钮 ✅
**重构** (`apps/web-next/app/(app)/overview/people/[id]/page.tsx`):
- 头部回归单列紧凑卡片 (单 `<header>` 包裹,不再左右分栏)
- 大头像 + 状态点 + 姓名 + SID + 创始人 badge + 在职/停用 chip
- 4 行信息密度: 身份 / 角色部门 / 联系方式 / 状态+元数据
- **tab 行右侧醒目 [编辑] 按钮** (主色 `bg-foreground text-background`)
- 编辑按钮逻辑: 切到 basic tab + 开启 `globalEdit` 状态
- 再次点击 → "退出编辑"

### 5. `?edit=true` 自动进编辑模式 ✅
- `page.tsx` 读 `useSearchParams().get("edit")`
- 初始 `globalEdit = (edit === "true")`
- 自动切到 basic tab + 触发 PersonEditPane 编辑模式

### 6. PersonEditPane 支持受控编辑 ✅
**重构** (`apps/web-next/app/(app)/overview/people/[id]/_components/person-edit-mode.tsx`):
- 新增 `controlledEditing?: boolean` 受控 prop
- 新增 `onEditingChange?: (v: boolean) => void` 回调
- 内部状态与外部 state 兼容 (受控时外部为主)
- 组件内的 `<Pencil>` 按钮移除 (改由详情页 tab 行触发)

### 7. 协作对象 tab 3 分区说明 ✅
**重构** `CollaboratorsTab` (`person-tabs.tsx`):
- 顶部"协作对象说明"卡片 + 3 行清单 (能做什么/看什么/用什么)
- 3 个分区卡片 (md:grid-cols-3):
  1. **可调度的数字员工** (紫色 accent) - 实数据 `bound.length`
  2. **可访问的知识库** (绿色 accent) - KB 权限按角色 (placeholder)
  3. **可使用的任务模板** (蓝色 accent) - 实数据 `pipelines.length`
- 每个分区: 图标 + 数量 chip + 列表(最多 5 项,多了折叠) + 管理入口 Link
- 删除老的 `CapabilityCard` 简单计数卡

### 8. 添加员工按钮 (已存在) ✅
- `/overview/people/page.tsx` 头部已有醒目按钮 "+ 添加员工" (line 119-125)
- 点击 → `/overview/people/new` 独立页 (R14 已实现)
- 不从列表底部 inline 添加 ✓

## 验证

### Playwright 测试 `e2e/specs/r17-2-people-card.spec.ts` (5 个用例,全过)
```
R17-2 · 01 卡片可点 + 无三点菜单         ✓
R17-2 · 02 点击卡片进入详情              ✓
R17-2 · 03 详情页头部紧凑 + 编辑按钮     ✓
R17-2 · 04 协作 tab 3 分区              ✓
R17-2 · 05 ?edit=true 自动进编辑模式     ✓
```

### 全局回归 `q3-33pages.spec.ts` (30 passed, 1 failed flaky, 3 skipped)
- 失败的 `/login/` 单独跑通过 (并发干扰)
- `/overview/people/`, `/overview/people/[id]` 都通过

### Build
- `npx next build` 成功
- `npx tsc --noEmit` 我的文件 0 错误 (pre-existing 错误未引入新问题)
- `pm2 reload web-next` 重启成功

### 截图证据 (在 `.claude/`)
- `r17-2-people-list.png` - 卡片列表 (整卡可点 + 图标行)
- `r17-2-person-detail.png` - 详情页 (头部紧凑 + tab 行编辑按钮)
- `r17-2-collab.png` - 协作 tab (3 分区)
- `r17-2-people-card-hover.png` - 卡片 hover 状态

## 待办 (下一步)

- [ ] R17-3: /employees 数字员工页改版 (与 R17-2 详情页风格统一)
- [ ] R17-4: /tasks 任务列表改版
- [ ] R17-5: /foundation 数智底座改版
- [ ] 测试 `e2e/specs/r17-2-people-card.spec.ts` 加到 CI

## 关键决策 / 约束

### 不能动
- ❌ sidebar/topbar (R17-1 负责)
- ❌ /employees 路由 (R17-3)
- ❌ /tasks 路由 (R17-4)
- ❌ /foundation 路由 (R17-5)

### 设计选择
- **图标行替代三点菜单**: 用户明确反馈三点菜单弹出位置尴尬,样式难看。图标行直接显示常用操作,hover tooltip 标签。
- **整卡可点**: 用户反馈"卡片点不开",整卡可点最直观。内部按钮 `stopPropagation`。
- **CSS tooltip**: 不引入新依赖,用 Tailwind `group-hover` 实现。同时 `title` fallback。
- **头部紧凑**: 用户反馈"两边脱离,排版差",回归单 `<header>` 块。
- **醒目编辑按钮**: tab 行右侧,主色背景,比之前 ghost 按钮明显得多。
- **controlledEditing**: PersonEditPane 受控,支持外部触发编辑 (?edit=true 自动编辑)。

### 文件边界
只动了 4 个文件:
1. `apps/web-next/app/(app)/overview/_components/person-card.tsx` (重写,651→677 行)
2. `apps/web-next/app/(app)/overview/people/[id]/page.tsx` (重写,210→313 行)
3. `apps/web-next/app/(app)/overview/people/[id]/_components/person-edit-mode.tsx` (改,250→251 行)
4. `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` (改 CollaboratorsTab + BasicTab)

新增 1 个测试文件:
- `apps/web-next/e2e/specs/r17-2-people-card.spec.ts`

## 用户偏好 / 风格

- 沟通: 直接干, 不问选择
- 视觉: 紧凑 > 宽松, 单列 > 多列 (用户明确反馈)
- 图标: lucide-react, 不用 emoji
- tooltip: 简单 CSS hover, 不引依赖
- 权限: admin 全权, 自己不能管理自己

## 重要文件 / 路径

### 服务端
- SSH: `mcp__ssh-mah__*` (43.135.149.34, ubuntu)
- 工作目录: `/home/ubuntu/panmira-N1/`
- 分支: `r17-5-kb-mcp` (实际,不是 main)
- pm2 进程: `web-next` (id 54)
- URL: `http://localhost:3200/overview/people/`

### 关键文件
- `apps/web-next/app/(app)/overview/_components/person-card.tsx` - 卡片(图标行+tooltip)
- `apps/web-next/app/(app)/overview/_components/data.ts` - Person/PersonAgent 类型
- `apps/web-next/app/(app)/overview/people/[id]/page.tsx` - 详情页(头部+编辑按钮)
- `apps/web-next/app/(app)/overview/people/[id]/_components/person-edit-mode.tsx` - 受控编辑
- `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` - 7 Tab 内容
- `apps/web-next/e2e/specs/r17-2-people-card.spec.ts` - R17-2 验证测试

### 后端 API
- `GET /api/auth/users` - 员工列表
- `GET /api/auth/users/:id` - 单个员工
- `PATCH /api/auth/users/:id` - 更新 (admin/operator)
- `POST /api/auth/users/:id/reset-password` - 重置密码
- `DELETE /api/auth/users/:id` - 删除 (仅 admin + departed)
- `GET /api/v2/people/:id/stats` - 统计
- `GET /api/v2/people/:id/agents` - 关联数字员工
- `GET /api/v2/people/:id/usage` - 资源消耗

## 验证步骤

```bash
# 登录
ADMIN=$(curl -s -X POST http://localhost:9100/api/auth/login \
  -H "content-type: application/json" \
  -d '{"email":"20218181@qq.com","password":"shidefei@2026"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 取 shidefei id
SHIDEFEI_ID=$(curl -s -H "authorization: Bearer $ADMIN" http://localhost:9100/api/auth/users \
  | python3 -c "import sys,json; d=json.load(sys.stdin); users=d.get('users',d); print([u['id'] for u in users if u['email']=='20218181@qq.com'][0])")

# 验证页面 200
curl -s -o /dev/null -w "people list: %{http_code}\n" "http://localhost:3200/overview/people/"
curl -s -o /dev/null -w "detail: %{http_code}\n" "http://localhost:3200/overview/people/$SHIDEFEI_ID/"
curl -s -o /dev/null -w "detail?edit: %{http_code}\n" "http://localhost:3200/overview/people/$SHIDEFEI_ID/?edit=true"
curl -s -o /dev/null -w "new: %{http_code}\n" "http://localhost:3200/overview/people/new/"

# 跑 R17-2 测试
cd apps/web-next && npx playwright test e2e/specs/r17-2-people-card.spec.ts --reporter=line
```

## git commits (待提交)
1. `fix(web): person-card 点不开修 + 整卡可点 + 图标行替代三点菜单`
2. `feat(web): 真人详情头部紧凑卡片 + 编辑按钮醒目 + ?edit=true 自动编辑`
3. `feat(web): 协作对象 tab 3 分区说明 + 删除老 CapabilityCard`
4. `test(web): R17-2 卡片+详情页 5 个 E2E 用例`
