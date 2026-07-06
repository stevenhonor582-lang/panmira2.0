# Plan Phase 3 · 完整功能迁移 · Handoff(2026-07-06)

## ⚡ Phase 3 完成:11 个 P0 页 + 3 个补 + sidebar 重组

### 部署信息
- **公网**: https://deepx.fun/web-next/
- **pm2**: `web-next` PID 35,11 个新页面 + 5 个原 Phase 1-2 页全部上线

### Phase 3 新增页面
- Resources 双 tab(MCP + Plugin)
- Alerts 预警中心(过滤 bot/type)
- Diagnose 异常诊断(task 详情)
- Reports 资源报表(5 维度 + 时间范围)
- Cost 成本分析(总成本 + 按维度 + 每日)
- Audit 审计日志(actor/action/ip)
- OAuth Client + secret 一次性显示 + Revoke
- Permissions 矩阵(4 角色 × 24 scope)
- Memory + Voice 占位(API 内部 key)
- Models 补 status toggle(仅 embedding)

### 完整路由清单(16 页)
`/login /dashboard /agents /models /knowledge /channels /status /alerts /diagnose /reports /cost /audit /oauth-clients /permissions /resources /memory /voice /settings`

### Sidebar 6 组分类
- **工作台**: 总览 / Agent
- **资源池**: 模型池 / KB / Skill-MCP
- **监控**: 实时状态 / 预警中心 / 异常诊断
- **运营**: Channel / 资源报表 / 成本分析 / 审计日志
- **权限**: OAuth Client / Permissions
- **系统**: Memory / Voice / 设置

### 修过的后端 bug
- monitoring-routes.ts: status date varchar / alerts message→error_message / diagnose bot_name / last_used / errorsRes timestamp(3 处)
- ops-routes.ts: cost mv 没 cost_usd → usage_reports 原表 + varchar date 转换

### 保留(未做 — 后端依赖)
- Channel 实体完整字段(等 plan B 资源池 mcp_servers + channels 表)
- Memory CRUD 完整编辑器(API 是 internal key)
- Voice 流式会话(需 RTC SDK)
- Settings 页(原 SettingsView 13 个 Section)

### 测试账号
- `admin@panmira.com` / `admin123`

### 下一步建议
- P1: 设置页(SettingsView 13 个 Section)
- P2: Memory 完整 UI(独立 viewer)
- Plan B 资源池: Channel 实体扩展
- 自动刷新: Dashboard / Status 加 polling
