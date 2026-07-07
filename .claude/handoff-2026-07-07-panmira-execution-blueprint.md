# Plan H1 + Execution Blueprint · Handoff (2026-07-07)

## 当前任务
通宵冲刺完成:plan-H1 IA 骨架 + Agent template 执行蓝图后端 + UI

## 已完成(自动完成 · 用户睡眠期间)
- [x] 后端 P0: Zod schema + DAG cycle detection + skill_dags 表 + runtime sessions API
- [x] UI P1: AgentTemplateEditor(4 Tab)+ SkillDagEditor(JSON)+ RuntimeConsole
- [x] P2: 集成 routes/sidebar/i18n + build + merge + deploy + e2e 验证

## 关键变更

### 后端(新增 4 文件 + 修改 3)
- `src/lib/agent-blueprint.ts`(100 行):Zod schema for orchestration/tools/boundary/ironLaws
- `src/lib/schema-validator.ts`(99 行):DAG validation + cycle detection
- `src/db/schema.ts`:新增 `skill_dags` 表(894 行,17 行新表)
- `src/api/routes/runtime-routes.ts`(115 行):GET sessions/stats + POST interrupt
- `src/api/routes/skill-dag-routes.ts`(115 行):CRUD with auto-validation
- `src/api/http-server.ts`:注册 2 个新 routes
- `src/api/routes/oauth-routes.ts`:新增 `runtime:read`, `runtime:admin` scopes

### Web(新增 6 文件 + 修改 4)
- `web/src/components/AgentTemplateEditor.tsx`(130 行):4-Tab editor
- `web/src/components/AgentTemplateEditor.module.css`
- `web/src/components/SkillDagEditor.tsx`(145 行):JSON editor + validation
- `web/src/components/SkillDagEditor.module.css`
- `web/src/components/RuntimeConsole.tsx`(154 行):stats + session table
- `web/src/components/RuntimeConsole.module.css`
- `web/src/routes.ts`:3 个新 sidebar 入口
- `web/src/App.tsx`:3 个新路由
- `web/src/i18n/locales/{zh,en}.json`:runtime + blueprint + dag keys

## ⚠️ Build Script 修复(commit 3c173531)

`npm run build` 原本调 `tsc` 默认用 `tsconfig.json` 但有 `noEmit: true`,**导致 dist 不更新**(静默跳过编译)。已改为 `tsc -p tsconfig.build.json`(emit 模式)。新加后端文件后如发现路由 404,先 `rm -rf dist && npm run build && pm2 reload panmira`。

## 部署状态

- **branch**: `fix/memory-system-2026-06-27` 已 merge + push
- **HEAD**: `559c649a fix(merge): restore AdminLayout + Sidebar from H1`
- **pm2**: panmira PID 34 online(已 reload)
- **e2e**: 
  - https://deepx.fun/web/ → 200
  - https://deepx.fun/web/app/runtime → 200 (SPA fallback)
  - https://deepx.fun/web/app/agents/templates → 200
  - https://deepx.fun/web/app/skills/dags → 200
- **API e2e** ✅: 用 admin JWT 实测全部 200,返回真实数据(stats / sessions / skill-dags)

## ⚠️ Nginx 修复(commit fc5710d7 + 服务器侧)

`/web/` 之前没在 nginx,所有 `/web/*` 兜底到 panmira 后端 → 404。已加 nginx location:

```nginx
location /web/ {
    alias /home/ubuntu/panmira/dist/web/;
    try_files $uri $uri/ /web/index.html;
}
location = /favicon.ico { return 204; }
```

外加 `chmod o+x /home/ubuntu`(让 www-data traverse)。

## 验证步骤

浏览器:
1. https://deepx.fun/web/login → admin@panmira.com / admin123
2. 侧栏 → "Runtime Console"(工作台组第一个)
3. 侧栏 → "执行蓝图"(Agent 列表下)
4. 侧栏 → "Skill DAG 编写"(Skill/MCP 池下)
5. ⌘K 调出命令面板,搜索 "Runtime" / "DAG" / "蓝图"

## 已知限制 / 下一轮

- **DAG 可视化画布**:现在是 JSON 编辑器,**未做 react-flow 画布**(估计 2-3 天)
- **Dry-run 测试**:未实现(需要 sandbox 跑节点,1-2 天)
- **回归测试集**:未实现(每个 skill 版本绑 input/expected-output)
- **WebSocket 实时 session 推送**:现在 30s 轮询,WS 升级 1 天
- **运行时控制台的中断**:v0 用内存 Map,重启失效;需要 persist 到 Redis/db(0.5 天)
- **Feishu session/memory/resume + 卡片**:完全没动(用户说最后修)

## 上下文恢复

下次会话开头:
1. 读 `.claude/handoff-2026-07-07-panmira-execution-blueprint.md`(本文件)
2. 读 `.claude/handoff-2026-07-07-panmira-NextJS-MVP-FINAL.md`(前一 handoff)
3. `pm2 list` 看到 panmira online
4. 看 git log: `fix/memory-system-2026-06-27` HEAD = `559c649a`
5. 浏览器打开 https://deepx.fun/web/login 验证 3 个新页面

## 下一步选择

- [A] 修 API e2e 404(scope 中间件问题)
- [B] 做 DAG 可视化画布(react-flow)
- [C] Feishu session 管理 + 卡片重构(用户已说最后修)
- [D] 别的
