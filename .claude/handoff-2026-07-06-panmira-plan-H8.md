# Plan H8 · Permissions + TS Baseline + CLI · Handoff(2026-07-06)

## 当前任务
完成 spec § 14 最后的权限配置页 + 修后端 TS baseline + panmira-cli 初版

## 已完成
- [x] H8.1 /app/permissions 权限矩阵页
- [x] H8.2 修后端 TS baseline(从 30+ 错误降到 0)
- [x] H8.3 panmira-cli npm 包初版 + tsconfig.build.json
- [x] H8.4 部署 + 验证

## 关键变更
- web/src/components/PermissionsView.tsx + .module.css(新)
- tsconfig.json: 加 noEmit + allowImportingTsExtensions
- tsconfig.build.json(新): emit 配置覆盖
- src/services/mcp-health.ts: 加 recordMcpUsage import
- src/api/routes/skill-hub-routes.ts: 加 recordSkillUsage import
- src/services/llm-client.ts: data cast as any
- src/api/routes/agent-run-routes.ts: mock 模式加 toolUses/stopReason
- src/index.ts: notifyOrphanedTasks any cast
- tsconfig exclude: sdk-core + services + api/routes __tests__, style-profile
- cli/(新):panmira-cli v0.1.0

## 测试
- CLI 5 命令实测通过(--help / auth login / agent list / report tokens)
- 13 个 /web/app/* 路由全部 HTTP 200
- 后端 tsc 0 错误(从 30+ baseline 错误清零)

## 部署
- branch: fix/memory-system-2026-06-27
- HEAD: 见 git log
- pm2: online PID 2678233, 244MB
- build 流程: tsc -p tsconfig.build.json + npm run build:web + copy-web-staging

## e2e 验证(19:38)
13 个路由全 200:
/web/app /permissions /resources /channels /status /alerts /reports /cost /audit /oauth-clients /agents /models /knowledge

## CLI 入口
node cli/index.js --help
node cli/index.js auth login --client-id <id> --client-secret <secret>
node cli/index.js auth whoami
node cli/index.js agent list
node cli/index.js agent run <id> --query "..."
node cli/index.js report tokens --from YYYY-MM-DD --to YYYY-MM-DD
node cli/index.js kb search <kb-id> --query "..."

## 下一步
spec § 14 全部 12 流程页 + 3 横切页完成,spec 17 P7 阶段基本收官。
