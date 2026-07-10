# 会话交接 - 2026-07-08 R16-2 资源频道 MCP+接入点+OAuth+路由

## 当前任务
R16-2 资源频道模块: 导入 7 真实 MCP + 完整 CRUD + 4 页前端全中文化

## 已完成

### 后端
- migration `migrations/2026_07_08_r16_mcp_import.sql`: 清空 4 占位 + 导入 7 真实 MCP
- `scripts/mcp-stdio-probe.py` (193 行): STDIO MCP 子进程探测器
- `src/api/routes/r9-mock-endpoints-routes.ts`: testMcpServer 对 STDIO 调用 probe 子进程
- 复用已有 endpoints/oauth/routing CRUD (channels-routes + r9-mock)

### 前端(4 页全中文)
- mcp/page.tsx (656 行): 7 真实 MCP + 测试连接(展开 tools) + CRUD + 新增 modal
- endpoints/page.tsx (623 行): 5 飞书 bot + 出/入站 tabs + 5 类接入点向导
- oauth/page.tsx (572 行): 6 clients + 4 authorized + 创建/rotate/revoke
- routing/page.tsx (493 行): routing_bindings CRUD + 拖拽 priority + 调试探针

## 验证记录

### DB: 7 真实 MCP
```
 Diamond Memory   | stdio | active
 GitHub MCP       | http  | active
 MiniMax 多模态   | stdio | active
 SSH Hailianzhida | http  | active
 SSH Ruoshui      | http  | active
 SSH Turtle       | http  | active
 SSH VMT          | http  | active
```

### STDIO 测试连接(MiniMax 多模态)
- POST /api/mcp/servers/c6f3177f-bc3e-4073-9a47-cb1a3af24e4d/test
- → ok=True, toolsCount=6 (gen_image/clone_voice/gen_music/gen_video/music_cover/query_task)

### TypeScript / Build
- tsc --noEmit: 0 errors (channels 4 页全过)
- next build: 全 30+ 页编译成功

### Playwright
- q3-33pages.spec.ts: 34/34 passed (1m)
- r16-2-functional.spec.ts: 4/4 passed

### API 直测
- GET /api/mcp/servers → 7 servers
- GET /api/v2/channels/endpoints?purpose=outbound → 5 endpoints (玄鉴/守静/信言/得一/不盈)
- GET /api/v2/channels/oauth/clients → 6 clients
- GET /api/v2/channels/oauth/authorized → 4 authorized
- GET /api/v2/admin/channels → 0 routes (空,需用户后续添加)

## 关键决策 / 约束
- MCP 真实数据来源: 服务器 `~/.claude.json` 7 个 mcpServers
- STDIO 测试连接走子进程(scripts/mcp-stdio-probe.py),不依赖前端
- api_key_encrypted 字段复用现有 ENCRYPTION_KEY 加密
- 测试连接 timeout 12s(进程)+ 5s(initialize)+ 5s(tools/list)
- 飞书/微信/企微/WhatsApp 各自字段不同,前端按 PLATFORM_FIELDS 动态渲染
- 4 页全中文(除 MCP/HTTP/SSE/Webhook/Bearer 等技术词)

## 待办(后续可能的工作)
- [ ] routing_bindings 当前为 0 条,需要业务侧添加实际规则
- [ ] Diamond Memory MCP 在 Web 测试时退出(env 缺失),需要确认是否需要给它配 API_BASE env
- [ ] github-mcp / ssh-* MCP 当前未真实测试(HTTP 协议假设)— 真实联调时可能需要补 header
- [ ] 飞书/微信/企微/WhatsApp 字段保存为 JSON,目前只是数据载体,真实消息发送需另接 IM adapter

## 重要文件 / 路径
- 服务器: 43.135.149.34 (ubuntu)
- 后端: src/api/routes/{r9-mock-endpoints-routes,channels-routes,oauth-client-routes}.ts
- 前端: apps/web-next/app/(app)/channels/{mcp,endpoints,oauth,routing}/page.tsx
- DB: postgresql://ubuntu:ubuntu@localhost:5432/metabot
- 后端端口 9100,前端端口 3200
- HEAD: 14e02ad (main)
- 截图: .claude/r16-2-{mcp,endpoints,oauth,routing}.png
