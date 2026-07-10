# 会话交接 - 2026-07-09 R33-C 角色模板/引擎模型/入口管理

## 当前任务
R33-C 数字员工模块重构:角色模板解绑 + 引擎模型下拉删除 + 复杂度状态中文化 + 入口绑定管理可视化 + 全站英文清除

## 已完成 (4 commit)
- [x] ⑤ 编辑页删除角色模板下拉(实例独立,创建时选定不可改)
- [x] ⑥ 实例只能改自身配置,不存在"更换模板"操作
- [x] ⑦ 模板列表前端过滤 isTemplate=true,实例不在模板列表
- [x] ⑧ 编辑页删除引擎/模型下拉(由专属大模型卡片管理)
- [x] ⑨ 复杂度改中文四档:极速简答/均衡对话/深度推演/自主专家
- [x] ⑩ 状态改三项中文:启用/暂停/弃用
- [x] ⑪ 全站英文清除(gallery/step/tab 模块,保留 Token/URL/API Key 等技术名词)
- [x] ⑫ 接入入口管理可视化(名称/平台/在线状态/绑定时间)
- [x] ⑬ 绑定/解绑操作(PATCH agent.channel_ids,R27 一对一校验)

## Commit 记录
1. `56bbbac` feat: R33-C ⑤⑥⑦⑧⑨⑩ 角色模板解绑 + 引擎模型下拉删除 + 复杂度状态中文化
2. `fb6f9a9` feat: R33-C ⑫⑬ 接入入口管理可视化 + 绑定/解绑操作
3. `839bea1` feat: R33-C ⑪ 全站英文清除(数字员工模块)

## 关键决策 / 约束
- 模板仅在创建向导(step 0)可选,编辑页角色类型只读
- 引擎/模型不在编辑页直接改,由 R31-C 专属大模型卡片独立管理
- 复杂度四档为智能体运行参数,不受底层模型影响
- 入口绑定通过 PATCH agent.channel_ids,channel_ids 存的是 bot_id(UUID)
- 后端 R27 已有一对一校验(findBotBindingConflict),冲突返回 409

## 验证
- `npx next build` 通过(无 TS 错误)
- `pm2 reload web-next` 成复(PID 54)
- `npx playwright test e2e/specs/q3-33pages.spec.ts` — 34 页全过(初次 5 flaky,重跑全绿)

## 重要文件 / 路径
- `apps/web-next/app/(app)/employees/[id]/_components/tab-basics.tsx` (⑤⑧⑨⑩)
- `apps/web-next/app/(app)/employees/[id]/_components/tab-collab.tsx` (⑫⑬ EntryManagement + RuntimeFields)
- `apps/web-next/app/(app)/employees/templates/_components/templates-board.tsx` (⑦)
- `apps/web-next/app/(app)/employees/_components/gallery-board.tsx` (⑪)
- `apps/web-next/app/(app)/employees/new/_components/step-{1,3,5}.tsx` (⑪)

## 待办 (next)
- [ ] 真人测试:创建数字员工 → 选模板 → 确认编辑页无模板/引擎下拉
- [ ] 入口绑定实测:绑定一个飞书 bot → 确认 channel_ids 更新 + 协作图显示
- [ ] 如有遗漏英文,继续扫描其他模块(channels/tasks/overview)
