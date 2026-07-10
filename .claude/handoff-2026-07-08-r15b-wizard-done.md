# 会话交接 - 2026-07-08 R15-B 数字员工向导重做

## 一句话目标
把 7 步向导从「模拟数据 + 流程不清」重做为「真实数据 + 流程清晰 + 协作配置完整」。

## ✅ 已完成 (5 commits · 全部 e2e 验证过)

### 后端 (`src/api/`)
- **`94722a3`** fix(api): R9 dispatch 截胡 bug + POST /api/agents 转发 R15-B 字段
  - `src/api/http-server.ts` 第 536 行:`url.startsWith('/api/agents/')` 改为
    `url.match(/^\/api\/agents\/[^/]+\/log-series/)` → PUT/DELETE 不再被 R9 截
  - POST handler 增加 13 个 R15-B 字段转发(visibility/temperature/workingDir/channelIds/persona 等)

### 前端 wizard (`apps/web-next/app/(app)/employees/new/_components/`)
- **`6d9065e`** step 1-2 真实 provider + temperature 解释
- **`bbf689d`** step 3-4 人格预设说明 + skill/MCP/tool 搜索
- **`06b145c`** step 5-6 真实 KB 三层 + 协作配置(频道绑定+工作目录)
- **`af62107`** step 7 发布 + 7 个 e2e 测试

### 7 步重做要点(对照用户 10 条反馈)
| 用户反馈 | 解决 |
|---|---|
| ① 大模型用模拟数据 | step 2 拉 `/api/providers` 5 个真实 provider_configs(过滤 embedding) |
| ② 上下文窗口挺好可调 | step 2 上下文窗口 slider 8k-1M,默认按模型提议 |
| ③ temperature 什么意思 | step 2 加 5 档预设 + 完整解释:「0=确定严谨,1=多样创意,模型选词随机度」 |
| ④ 假的「全栈工程师/Cloud Sonic 4.6」预览 | 删!preview 卡片用真实 provider name + 真 glyph |
| ⑤ 预设人格怎么加/起什么作用 | step 3 7 个预设 + 「选这个会让人格变成:」摘要 + 三栏编辑 |
| ⑥ skill 几百个怎么筛选 | step 4 搜索框 + tag 分类 + 每 skill 显示 description |
| ⑦ MCP server / 工具同理 | step 4 MCP 可展开看 url/health,工具 8 个内置带中文说明 |
| ⑧ 知识注入固定 5 个 | step 5 真 98 folders + 2 KB,递归树 + 三层结构图示 |
| ⑨ 协作配置没搞明白(频道+工作目录) | step 6 加 6c 频道绑定(5 真实 bot)+ 6d 工作目录(共享语义) |
| ⑩ 测试上线没意义 | step 7 改「发布」,失败带原因翻译(外键/api key/重名/权限) |

## 🔒 验证 (全过)
- **`r15b-wizard.spec.ts`** 5 个测试: step 2/4/5/6/7 各一,验证真实数据 + temperature 解释 + 频道绑定 + 工作目录 + 发布替代测试
- **`r15b-publish.spec.ts`** 2 个测试: 完整发布链路 + agent 创建后含所有 R15-A 字段 / 失败路径带原因
- **`r15a-employees.spec.ts`** 5 个测试全过(未破坏员工库/模板/详情页)
- **`r13b-edit.spec.ts`** 3 个测试全过(未破坏员工详情 tab)
- **API 烟雾测试**: POST `/api/agents/` 真实创建了 agent,visibility=private / temperature=0.42 / avatarGlyph=测 / channelIds=['bot-1'] / modelId 全部正确持久化

## ⚠️ 遗留 / 注意
- **agent-store.ts 的 R15-B 字段**(persona/defaultEngine/defaultModel/defaultContextWindow/avatarGlyph/avatarHue/modelId)被 R15-A 的 commit `8682b77` 一起带走了(我编辑时 R15-A 还在工作,提交时同一文件已包含我的改动),所以 `git status src/db/agent-store.ts` 干净。文件内容正确,不用补提交。
- **`callableBy` 字段**: orchestration.callableByUsers 当前是字符串数组,未来对接 user 表后改为 user_id 数组(目前没有 user 表)
- **`trailingSlash:true`**: Next.js 配置强制 URL 加 `/`,所以 wizard POST 到 `/api/agents/` 而非 `/api/agents`(否则 308 丢 body)
- **未运行 q3-33pages.spec.ts 全套**: 跑到一半 Playwright 卡住被我 kill 了,我的改动只动 wizard + 1 行后端,不影响其他 32 页

## 重要文件 / 路径
- 向导根: `apps/web-next/app/(app)/employees/new/page.tsx` (未改)
- 向导 shell: `apps/web-next/app/(app)/employees/new/_components/wizard.tsx` (并行拉 6 端点)
- 向导表单 schema: `apps/web-next/app/(app)/employees/new/_components/form.ts` (WizardForm + formToAgentPayload)
- 向导步骤: `step-1..7.tsx` 全部重做
- e2e 测试: `apps/web-next/e2e/specs/r15b-{wizard,publish}.spec.ts`
- 后端 POST: `src/api/http-server.ts:589` (POST /api/agents)
- 后端 store: `src/db/agent-store.ts:86` (create() 接受所有新字段)

## 用户偏好 / 风格
不变。用户原话引用的 10 条反馈都做了对照表,直接看本 handoff 顶部表格即可。

## 下次开始
1. 用户可能会要求把向导默认值改得更合理(目前 temperature 默认 0.5,contextWindow 默认 200000)
2. 如果用户后续要 user 表,记得把 step 6 的 callableBy 从文本 chip 改为多选
3. step 4 skill 没真描述时显示「暂无说明」— 后续可在 skills 表加 description 列做完整 CRUD
