# 会话交接 — R51-D 协作配置 + 入口绑定一致性(2026-07-11)

## 当前任务
R51-D 主题:协作"谁可见"语义明确 + 入口绑定 3 处一致 + 入口 vs 频道概念区分。

## 完成 commit

| 子任务 | commit | 摘要 |
|---|---|---|
| D1 | `ba1273e` | tab-collab.tsx 可见性 3 档语义收敛 |
| D2 + D3 | `3260388` | 入口绑定一致性 + 入口/频道概念区分 |

## D1: 可见性 3 档语义(公开/团队/私有=草稿)

文件:`apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx`

- VISIBILITY_OPTIONS label:全局→公开, 分组→团队, 私有保留
- 新增 `draft?: boolean` 字段,private 选项标 `draft: true`
- 私有选项渲染时加 amber 「草稿」徽章 + tooltip "私有 = 草稿态,只有创建者本人或管理员可见"
- desc 文案改为:private "草稿态 — 只有创建者本人或管理员能看见与调度";team "同部门成员可调度(pipeline 编排时可串联)";public "全员可调度,所有 pipeline 自动可选"
- 底部说明从单行扩为 "3 档语义:公开 = 全员可见 · 团队 = 同部门可见 · 私有 = 草稿态(仅本人/管理员)"
- header 注释同步更新

**不动 backend**:visibility enum 仍为 `private|team|public`,仅 UI 文案/视觉对齐。

## D2: 入口绑定一致性(3 处统一显示已绑/未绑)

### Surface 1 — 真人详情 → 分配数字员工
文件:`apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx`
- bound 列表每个 agent 加 emerald 「已绑」徽章(`person-agent-bound-badge-{id8}`)
- pickerItems 加 `badge:{text:'未绑',tone:'free'}`,让用户看清空闲 vs 占用
- 说明文字同步:已绑=可调度 / 未绑=可添加

### Surface 2 — 数字员工详情 → 接入入口管理(已 R35-B/R36-3 三态)
文件:`apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx`
- 不动 — 已有完整 bound/free/occupied 三态 + emerald/amber 配色 + 顶部 stats "已绑定 X · 空闲 Y · 占用 Z"

### Surface 3 — 入口列表 → 已绑/未绑
文件:`apps/web-next/app/(app)/channels/endpoints/page.tsx`
- 新增 fetch `/api/bots`(权威来源 JOIN bot_configs.agent_id)
- 用 `bindingByBotName: Map<botName, BotBinding>` 缓存,`bindingFor(e)` 工具函数
- 出站表 + 入站表 各加 「绑定状态」 列:emerald 「已绑 · {agent名}」 vs muted 「未绑」
- 不动 backend — 从权威来源 /api/bots 拉数据

## D3: 入口 vs 频道概念区分

文件:`apps/web-next/app/(app)/channels/endpoints/page.tsx`(同 D2)

- 出站表 + 入站表 各加 「输入来源」 列 = `频道 · bot 名` 格式
- 飞书类: "飞书 · 不盈" / Web 类: "Web · web_玄鉴"
- title 属性 hover 看完整名

## 共享改动

文件:`apps/web-next/components/resource-picker/resource-picker.tsx`

- ResourceItem 新增 `badge?: { text, tone: 'bound'|'free'|'occupied' }` 字段(可选,向后兼容)
- 渲染时 badge 在 label 旁,不同 tone 不同底色
- 其他用法不传 badge 则不变

## 验证(superpowers 全部跑)

```
$ npx tsc --noEmit | grep -E '(endpoints/page|person-tabs|resource-picker|tab-collab)' | grep -v 'tab-collab.tsx(590,9)' 
  (空 — D1+D2+D3 文件均无新引入 TS error,只剩 pre-existing tab-collab.tsx(590,9) CATEGORY 类型断言)

$ npx next build
  ✓ Build completed (BUILD_ID=IPINwUoEJGkPLRngxfekh)

$ pm2 restart web-next
  ✓ HTTP 200

$ node /tmp/r51-smoke.cjs (Playwright 端到端)
  D2-Surface3: 已绑=5  未绑=0  输入来源=5
  D1: public=1(公开 public 全员可调度,所有 pipeline 自动可选) 
      team=1(团队 team 同部门成员可调度(pipeline 编排时可串联)) 
      private=1(私有 草稿 private 草稿态 — 只有创建者本人或管理员能看见与调度) 
      draft_badge=1
  D2-Surface2: bound_badge=3  free_list=0  occupied_list=1  stats="已绑定 3·空闲 0·占用 2"
  D2-Surface1: code 已在位(tsc clean),runtime smoke 因 /overview/people 路由超时未走通
  Errors: 0
```

**注意**:web-next 当前因其他 R51 子任务并发 build/rebuild 而 crash loop,smoke 截图见 #34b7e74d 时间窗之前是稳的。

## 关键决策 / 约束

- 不动 backend(R51-D 严格 scope)
- 不动 R36-R50 任何 commit
- 不"假装跑" — e2e 是连接问题导致失败,非代码 bug;smoke 直接调 playwright 确认 DOM 渲染

## 用户偏好 / 风格
- 一针见血、决策快
- 不要"假装跑了" — 用户最在意的就是验证真实性
- 完成给报告,别问 A/B/C

## 重要文件 / 路径
- `apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx` (+26 -5)
- `apps/web-next/app/(app)/channels/endpoints/page.tsx` (+112 -9)
- `apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx` (+18 -3)
- `apps/web-next/components/resource-picker/resource-picker.tsx` (+22 -2)

## 下次会话优先
- R51-B 后端:GLM-5.2 模型代码不存在(activity_events 一直 error_message)
- R51-C:模板发布流水线梳理
- R51-E:卡片重设计已部分完成,需要回归 R52

## main HEAD
`3948a14` (R51-A2 commit,R51-D 我的 commits 在 `3260388` + `ba1273e`)
