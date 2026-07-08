# R13-E Channels 6 大深化 · 完成

**时间**: 2026-07-08 20:00
**HEAD**: `b37f812` (分支: `feat/r13b-employees-edit`)
**任务**: `/channels` 6 页全部接通真实 CRUD + OAuth/MCP/接入点真实接入

---

## 一句话总结

LLM/Skills/MCP/Endpoints/OAuth/Routing 6 大频道页面全部从「只读 + 占位 stub」升级为「真实 CRUD + 真发请求测试/测速 + 拖拽排序 + 一次明文 secret」,前后端 + Playwright 全绿 (channels 7/7 PASS)。

---

## ✅ 已做 (6 大深化)

### 1. LLM 模型池 (R13E-LLM) ✓
- `provider-config-store.ts`: 加 `listSafe()` / `countAgentsUsing()` / `deleteIfNotInUse()`
- `provider-routes.ts`:
  - `GET /api/providers` 返 `hasApiKey + apiKeyMasked`(永不回显明文,后4位)
  - `GET /api/providers/:id` 单条 safe form
  - `POST /api/providers/:id/test` 真发 ping(10s timeout,返 `latencyMs`)
  - `PATCH /api/providers/:id` 别名
  - `DELETE /api/providers/:id` 检查 agents 引用,被引用返 409 + `agentCount`
- 前端:测速/编辑/删除/设默认 全部真实调用,带 toast 反馈

### 2. Skills 管理 (R13E-SKILL) ✓
- `skill-hub-routes.ts` 新增:
  - `POST /api/skills/install` (unified source: github|url,带 botName 自动绑定)
  - `POST /api/skills/:name/enable` (绑定到 bot,upsert)
  - `DELETE /api/skills/:name/binding` (解绑)
  - `POST /api/skills/batch` (批量 enable/disable)
  - `GET /api/skills/:name` 详情附 `skill_usage` 统计 (totalCalls/success/latency/daily)
  - fallback: 派生自 bot_skill_bindings 的 skill 也能查详情
- 前端:toggle 真调用 / URL 安装 modal / 详情抽屉(含 usage)

### 3. MCP servers CRUD (R13E-MCP) ✓
- `r9-mock-endpoints-routes.ts` 新增:
  - `POST /api/mcp/servers` (api_key 用 ENCRYPTION_KEY 加密)
  - `PATCH /api/mcp/servers/:id`
  - `DELETE /api/mcp/servers/:id`
  - `POST /api/mcp/servers/:id/test` (JSON-RPC `tools/list`, 10s timeout, 更新 `tools_cache + health_status`)
  - `GET /api/mcp/servers/:id/tools` (查看缓存工具)
  - transport: http/sse/stdio, auth: none/bearer/basic/api_key
- 前端:测试连接(Play 图标)/新增/编辑/删除 真调用

### 4. 接入点双向 (R13E-EP) ✓
- `channels-routes.ts` 新增(handleChannelsRoutesV6 扩展):
  - `GET /api/v2/channels/endpoints?purpose=outbound|inbound` (基于 `bot_configs`)
  - `POST /api/v2/channels/endpoints` (创建)
  - `PATCH /api/v2/channels/endpoints/:id`
  - `DELETE /api/v2/channels/endpoints/:id`
  - `GET /api/v2/channels/endpoints/:id/messages` (最近 20 条该 bot 的 `activity_events`)
  - `GET /api/v2/channels/endpoints/:id/logs` (inbound 调用日志 from `audit_logs`)
  - `GET /api/v2/channels/endpoints/:id/callback-url` (inbound callback URL + allowedMethods + rateLimit)
  - `GET /api/v2/channels/health` 改用 `bot_configs`(原 `endpoints` 表不存在)
- 前端:切到新 URL + 5 outbound 真数据 + 新增 modal + 启停/删除 + asString defensive(防 object 渲染) + **修了 hooks-before-return bug**

### 5. OAuth 双向 (R13E-OAUTH) ✓
- `r9-mock-endpoints-routes.ts` 新增(在 `/api/v2/channels/oauth/*` 路径,匹配前端):
  - `POST /api/v2/channels/oauth/clients` 创建 client(明文 secret 只返一次)
  - `PATCH /:id` 更新 name/redirectUris/scopes
  - `DELETE /:id` 软删 (`status='revoked'`)
  - `POST /:id/secret/rotate` (新 secret 立即生效,旧 secret 失效)
  - `GET /:id/usage` (`access_tokens` 数 + 最近调用)
  - `POST /api/v2/channels/oauth/authorized` 手动添加授权
  - `DELETE /api/v2/channels/oauth/authorized/:id` revoke
  - `POST /api/v2/channels/oauth/authorized/:id/refresh` (续期 30 days + 更新 last_used_at)
- `oauth-client-routes.ts` (老 `/api/v2/admin/oauth-clients`) 保留不动 — 仍有完整 CRUD + rotate
- 前端:client 创建/吊销/rotate 真调用(`OAuthSecretModal` 显示一次明文) + authorized 撤销

### 6. 路由策略 (R13E-ROUTE) ✓
- 新建 `routing-rules-routes.ts` (174 行):
  - `GET /api/v2/admin/routing-rules` 列表(按 priority desc)
  - `POST` 创建 (groupId/pattern/targetBots/priority/enabled)
  - `PATCH /:id` 更新
  - `DELETE /:id`
  - `POST /reorder` (body: `ids[]`,重排 priority = (total - index) * 10)
  - `POST /probe` (body: `payload`,模拟匹配,返回所有匹配规则)
  - pattern 支持 JSON 条件 + substring fallback
- `http-server.ts` 精确插入 dispatch(用 python 而非 sed)
- 前端:切到新 URL + 上移/下移真 reorder + probe 真匹配后端 + 删除真调用

---

## 🔒 验证

### 后端 curl 测试(全部通过)
```
LLM: list=5 providers (hasApiKey=True, apiKeyMasked=••••8b85,无明文 apiKeyEncrypted 字段)
LLM test: ok=True latencyMs=284ms
LLM DELETE in-use: deleted=False err=provider_in_use agentCount=8 ✓
Skills: 66 派生 skills,install/enable/binding 全通,detail 含 usage
MCP: CRUD 全通 + test 连接(http URL)
OAuth: client 创建(secret 返一次)+ rotate + authorized CRUD 全通
Endpoints: outbound 5 items + inbound create/callback-url/delete 全通
Routing: create/reorder/probe(命中2规则) 全通
```

### Playwright
```
e2e/specs/q3-33pages.spec.ts -g "channels": 7/7 PASS (14.3s)
```

### 构建
```
后端 tsc -p tsconfig.build.json: 仅 2 个预存在错误(http-server.ts 988/1028,其他 agent 引入,与本任务无关)
前端 next build: SUCCESS(○ Static + ƒ Dynamic 全部编译通过)
```

---

## 📁 文件清单

### 后端(7 个文件)
- `src/db/provider-config-store.ts` (+56 行)
- `src/api/routes/provider-routes.ts` (+110 行)
- `src/api/routes/skill-hub-routes.ts` (+180 行)
- `src/api/routes/r9-mock-endpoints-routes.ts` (+354 行,MCP+OAuth)
- `src/api/routes/channels-routes.ts` (+251 行,endpoints CRUD)
- `src/api/routes/routing-rules-routes.ts` (新,174 行)
- `src/api/http-server.ts` (注册 routing-rules dispatch)

### 前端(7 个文件)
- `apps/web-next/lib/channels/api-mutations.ts` (新,82 行)
- `apps/web-next/app/(app)/channels/llm/page.tsx` (+ create modal + 真调用)
- `apps/web-next/app/(app)/channels/skills/page.tsx` (+ install/toggle/detail)
- `apps/web-next/app/(app)/channels/mcp/page.tsx` (+ create/test/delete)
- `apps/web-next/app/(app)/channels/endpoints/page.tsx` (+ 切 URL + create + hooks 修复)
- `apps/web-next/app/(app)/channels/oauth/page.tsx` (+ client/authorized CRUD)
- `apps/web-next/app/(app)/channels/routing/page.tsx` (+ reorder/probe 真调用)

---

## 🚀 Git commits (6 个,任务要求 4-6)

```
b37f812 feat(web): channels 6 页全部可交互 CRUD
efcaf53 feat(api): routing-rules CRUD + 拖拽排序
6e26733 feat(api): /api/v2/channels/endpoints CRUD + messages + inbound
b217f79 feat(api): /api/mcp/servers CRUD + test list tools
75518b2 feat(api): /api/skills install/enable/unbind + 详情
2e652bb feat(api): /api/providers CRUD + test 测速
```

(分支 `feat/r13b-employees-edit`,与 employees agent 共用 — 不冲突)

---

## ⚠️ 遗留 / 后续

1. **Skills 安装 GitHub 大仓库会慢** — 走 git clone,timeout 60s+,适合后台任务。已用 toast 提示。
2. **MCP stdio 测试** — 后端标记 "manual check needed"(没有真起子进程),UI 显示 errorMsg。
3. **Endpoints 编辑按钮** — 只接了启停/删除/创建,编辑(Pencil)尚未接(已 disabled,标 "尚未实现")。
4. **预存在的 tsc 错误 2 个** — http-server.ts 988/1028 行,其他 agent(R13-C foundation)引入的 RouteContext 类型签名问题,不影响 build/dist 产出。
5. **多 agent 并发** — 本会话中其他 agent 提交了 4-5 次(R13-C/R13-D),我用 `git stash` + 重新应用方式保持了我的工作不丢失。

---

## 🔁 恢复机制(下次开新会话)

```bash
cd /home/ubuntu/panmira-N1
git log --oneline | head -10  # 看 b37f812 是否在 HEAD~5 内
pm2 list                       # panmira + web-next 应该都 online
curl -s http://localhost:9100/api/providers -H "authorization: Bearer $ADMIN" | jq '.providers[0] | {hasApiKey, apiKeyMasked}'
# 应看到 hasApiKey=true, apiKeyMasked=••••xxxx, 无明文 apiKeyEncrypted
```

如有问题,先 `pm2 restart panmira web-next --update-env`,然后 `cd apps/web-next && npx playwright test e2e/specs/q3-33pages.spec.ts -g "channels"`。

