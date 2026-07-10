# 会话交接 - 2026-07-09 R26-A 协作 tab 关系总图

## 当前任务
把协作 tab 从「配置入口」重做为「关系总图」(只读展示),不做配置。

## 已完成
- [x] 新建 collab-overview.tsx (464 行)
- [x] 删掉原 3 个配置入口(可调度数字员工/可访问知识库/可使用任务模板)
- [x] 顶部统计(数字员工/知识库/任务/技能/工具/接入渠道,去重计数)
- [x] 重复项检测(同 KB/技能/工具被多 agent 共享 -> 警告区)
- [x] 每个 agent 折叠卡(默认折叠):KB/任务/技能/工具/接入渠道
- [x] person-tabs.tsx 改为 re-export 新组件 + 清理未用图标导入
- [x] npx next build 通过(0 error)
- [x] pm2 reload web-next online
- [x] Playwright q3-33pages 34/34 passed(含 people 详情动态页)
- [x] git commit f05a342

## 关键决策 / 约束
- 纯只读:协作 tab 只展示关系总图,配置在各 agent 内部完成
- 数据零后端改动:全部用现有 API 聚合
  - /api/v2/people/:id/agents (真人绑定的 agent)
  - /api/v2/employees/:id (agent 详情,含 knowledge_folders/skills/tools)
  - /api/v2/admin/pipelines (nodes[].agentTemplateId 反查关联 agent)
  - /api/bots (name -> platform,用于接入渠道)
- agent_pipelines.owner_id 引用 users(人)非 agents:任务按 nodes 反查 agent
- agent 列表 API 不返回 knowledge_folders/skills:必须逐个调详情接口
- 接入渠道:每个 agent 默认「网页」+ bot_configs name 匹配补平台

## 用户反馈(已落实)
1. 3 个配置入口不合理 -> 删除
2. 可调度数字员工在 agent 卡内配置即可,不重复 -> 不再重复
3. 可访问知识库概念冲突 -> 改为 agent 内 KB 展示
4. 可使用任务模板定义混乱 -> 改为「该 agent 参与的任务」(nodes 反查)
5. 协作对象只做总览不做配置 -> 纯只读
6. 脑图式关系图 真人->agent->资源 -> 折叠卡结构
7. 标出重复项(多 agent 共享 KB/技能) -> 重复检测 + 警告区

## 验证
- build: Compiled successfully in 23.5s (0 error)
- Playwright: 34/34 passed (q3-33pages, people 详情动态页无 pageerror/4xx)

## 重要文件 / 路径
- 新组件:apps/web-next/app/(app)/overview/people/[id]/_components/collab-overview.tsx
- re-export:apps/web-next/app/(app)/overview/people/[id]/_components/person-tabs.tsx:38
- 消费方:apps/web-next/app/(app)/overview/people/[id]/page.tsx:298
- commit: f05a342

## 待办(无)
R26-A 范围内全部完成。后续 R26-B 处理记忆/任务/日志 tab。
