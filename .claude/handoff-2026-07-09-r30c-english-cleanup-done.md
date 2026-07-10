# 会话交接 - 2026-07-09 R30-C 全站英文清理

## 当前任务
R30-C: 清理 panmira-N1 web-next 全站用户可见英文残留 + 修 mock fallback + 统一空状态文案。

## 已完成
- [x] 扫描 133 个 .tsx 文件,定位 13 个文件需改
- [x] 修 mock fallback: tasks/templates/page.tsx line 82 `?? "mock"` → `?? ""`(让后端自生成 id)
- [x] 修 fallback 文案: skills EmptyShell kind="Skills" → "技能";llm NotImplShell kind="LLM 服务商" → "大模型"
- [x] settings/voice 状态标签: ok/fail/idle/yes/draft/saved → 正常/失败/空闲/是/草稿/已保存
- [x] settings/voice uppercase 设计标签: config/test/snapshot/provider/voice_id/rate/lang/status/saved/persona 中文化
- [x] settings/permissions 表头: Name/Email/Role/Phone/Status/Locked Until/Action → 姓名/邮箱/角色/电话/状态/锁定至/操作
- [x] settings/permissions 状态值: active/inactive/locked → 活跃/停用/已锁定;(you) → (本人)
- [x] settings/advanced 模式徽章: DEV MODE/PROD-LIKE → 开发模式/类生产
- [x] settings/advanced uppercase: toggles·local/danger zone/system info/internal error log·verbose/ws events·last 50 中文化
- [x] settings/layout subnav: "permissions · voice · advanced" → 权限·语音·高级
- [x] employees/new/step-1: Hue → 色调
- [x] employees/[id]/tab-collab: TEMPLATE/INSTANCE → 模板/实例
- [x] tasks/scheduled: TRIGGER_LABEL cron "Cron" → "定时"
- [x] tasks/node-shapes: KIND_LABEL Human/Skill/Tool/conditional/Parallel → 人工/技能/工具/条件/并行
- [x] tasks/templates.ts: 运营 review → 运营复核;史德飞 oncall → 史德飞值班;oncall 派单 → 值班派单
- [x] admin/topbar-active: label="Pipeline" → "流水线";"最近 Pipeline" → "最近流水线"
- [x] skills 空状态加引导「通过上方 GitHub / URL 同步开始」
- [x] next build 通过(无 error/fail)
- [x] pm2 reload web-next (PID 54) online 131MB
- [x] e2e q3-33pages.spec.ts 22 passed (1.9m)
- [x] commit 11f6feb (13 files, +59/-72)

## 待办
- [ ] 视觉抽检(用户登录确认各页文字显示正常,截图反馈可选)
- [ ] 残余英文检查(用户视角再扫一轮可能漏的边角)

## 关键决策 / 约束
- 保留技术名词: Token/API Key/URL/HTTP/SSE/STDIO/MCP/LLM/KB/OAuth/Client/client_id
- 保留品牌名: GitHub/Slack/Telegram/OpenAI/DeepSeek/Anthropic/Google/WhatsApp/Feishu/Lark/LinkedIn/PAMELA/MiniMax
- 保留平台 API 字段名: App ID/App Secret/Verification Token/Encrypt Key/Corp ID/Agent ID/Secret/Token/Access Token(endpoints 配置面板用户在平台开发者后台看到的就是这个)
- 保留 OAuth 标准术语: Client/client_id/Secret/Scopes/Redirect URIs
- tab-collab "工作目录·working_dir/绑定频道·channel_ids/温度·temperature/类型·is_template/技能·skills" 保留双语(配置面板给运营/管理员,变量名是技术参考)
- admin/dashboard/recent-resources.tsx (admin 后台不在 (app) 范围,跳过)

## 重要文件 / 路径
- /home/ubuntu/panmira-N1/apps/web-next/  (前端目录)
- /home/ubuntu/panmira-N1/.claude/handoff-2026-07-09-r30c-english-cleanup-done.md  (本 handoff)
- 工作目录有他人 unstaged 改动 (layout.tsx/app-shell.tsx/sidebar.tsx/topbar.tsx/task-dag-editor.tsx/person-card.tsx/tasks/[id]/tasks/new/tasks/page.tsx),未动

## 远端
- panmira-N1 SSH: 43.135.149.34 (ubuntu)
- web-next: localhost:9100 → 302
- HEAD: main 11f6feb
