# Panmira Desktop v0.1 — Backend 契约 (mah)

> 调研日期：2026-06-11
> 调研对象：`ubuntu@43.135.149.34:/home/ubuntu/panmira` 分支 `feat/panmira-desktop-v0.1`
> 范围：Auth 契约 / WSS 契约 / 质量审查 三节
> 依据文件：见每节末尾「来源」标注

---

## 1. Auth 契约

**结论：mah 已自带完整的邮箱 + 密码 JWT 体系，无需桌面端做 OAuth2/飞书登录。**

### 1.1 端点（`src/api/routes/auth-routes.ts:handleAuthRoutes`）

| 方法 | 路径 | 鉴权 | 用途 |
|------|------|------|------|
| `POST` | `/api/auth/register` | 仅首次注册免鉴权 | 创建用户。首次启动会同时下发 token |
| `POST` | `/api/auth/login` | 无 | 邮箱+密码登录，返回 `user + accessToken + refreshToken` |
| `POST` | `/api/auth/refresh` | 无 | 用 `refreshToken` 换新 token 对 |
| `GET`  | `/api/auth/me` | `Bearer` | 取当前登录用户 profile（带 `Authorization` 头） |
| `POST` | `/api/auth/change-password` | `Bearer` | 改密码（admin 可改任意人） |
| `GET`  | `/api/auth/users` | `Bearer` + admin | 列出所有用户（仅 admin） |
| `PUT`  | `/api/auth/users/:id` | `Bearer` + admin | 切换角色/启用。body: `{ action: 'toggleRole' \| 'toggleActive' }` |
| `DELETE` | `/api/auth/users/:id` | `Bearer` + admin | 删除用户 |

**登录限流**：`5 attempts / 60s / IP`（`LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW` in `auth-routes.ts`）。

### 1.2 Token 格式

- 算法：HS256（`jose` 库）
- 来源：`src/api/middleware.ts`
- `accessToken` 有效期：`90d`（`ACCESS_TTL = '90d'`）
- `refreshToken` 有效期：`180d`（`REFRESH_TTL = '180d'`）
- 密钥：环境变量 `JWT_SECRET`（缺失时 `process.exit(1)`，启动即崩）
- Payload（access）：
  ```ts
  interface JwtPayload {
    sub: string;       // user.id
    email: string | null;
    role: string;      // 'admin' | 'member'
    tenantId: string;
  }
  ```
- Refresh payload 只有 `{ sub: user.id }`（无 email/role/tenantId）

**桌面端需要存的字段**：`accessToken`, `refreshToken`, `user.id`, `user.role`, `user.tenantId`。

### 1.3 登录响应 shape（`handleLogin`）

```ts
{
  user: { id, email, name, role, isActive, avatarUrl, tenantId },
  accessToken: string,   // 90d
  refreshToken: string,  // 180d
}
```

### 1.4 桌面端刷新策略

- 桌面端 401 时调 `/api/auth/refresh`，body `{ refreshToken }`
- 成功 → 新 `{ accessToken, refreshToken }`
- 失败 → 跳登录页
- **不要**自己算 TTL 后台定时刷新（已 90d，按需 refresh 足够）

### 1.5 OAuth2 / 飞书登录

**不存在。** mah 当前只有自建账号密码体系。飞书/Telegram/微信登录是 Bot 注册（`feishuAppId`/`telegramBotToken`/`wechatBotToken`），与用户登录是**两套完全不同的东西**。

桌面端 v0.1 走「邮箱 + 密码」登录即可，OAuth2 留到 v0.2+。

### 来源
- `src/api/routes/auth-routes.ts` (386 行)
- `src/api/middleware.ts` (73 行)

---

## 2. WSS 契约

**结论：mah 已有 `/ws` 端点 + 完整 message schema + 心跳 + 断线重连缓存。桌面端只做"瘦客户端"对接。**

### 2.1 连接

- **路径**：`/ws`（其它路径会被 `socket.destroy()` 拒绝，见 `ws-server.ts:154-158`）
- **鉴权**：通过查询参数 `?token=<JWT>`，调用 `verifyAccessToken`。也支持 `?token=<API_SECRET>`（`secret === token` 即通过）。失败返回 `401 Unauthorized` 后断开。
- **库**：`ws`（Node WebSocketServer，模式 `noServer`，挂到现有 HTTP server 的 `upgrade` 事件上）

桌面端建议在 `electron` 主进程建一个 `ws` 连接：
```
wss://<host>/ws?token=<accessToken>
```

### 2.2 心跳 / 重连

- **服务端心跳间隔**：`HEARTBEAT_INTERVAL_MS = 30_000`（30s，库级 `ws.ping()`）
- 30s 内没收到 `pong` 或任何 client 消息 → `ws.terminate()`
- 客户端 app-level `ping` 消息（`{ type: 'ping' }`）也会被识别为"活着"
- **重连缓存**：`lastStateCache` Map，10 分钟 TTL。客户端发 `{ type: 'resume', chatIds: [...] }` 拉取最近一个 `state`/`complete` 帧

桌面端实现：30s 一次 `ping` + 任意应用消息都算活动 + 断线 backoff 重连 + 重连后发 `resume`。

### 2.3 Client → Server 消息（`ClientMessage` union）

| `type` | 必填字段 | 用途 |
|--------|----------|------|
| `chat` | `botName, chatId, text[, messageId]` | 单 bot 对话。`messageId` 客户端生成，响应会用同一个 id |
| `proxy_message` | `botName, chatId, chatType, userId, text` | 代理 IM 平台消息（一般不用） |
| `group_chat` | `groupId, chatId, text[, messageId]` | 群聊。`text` 必须以 `@botName` 开头 |
| `stop` | `chatId[, botName]` | 终止正在跑的任务 |
| `answer` | `chatId, toolUseId, answer` | 回答 agent 的提问（`pendingQuestion`） |
| `create_group` | `name, members[]` | 至少 2 个成员 |
| `delete_group` | `groupId` | |
| `list_groups` | – | 返回 `groups_list` |
| `subscribe_group` | `groupId, chatId` | 订阅群组更新 |
| `resume` | `chatIds[]` | 重连后拉缓存 |
| `list_sessions` | `botName` | 列会话 |
| `adopt_session` | `chatId, sessionId` | 把已有 session 绑到新 chatId |
| `get_session_history` | `sessionId[, since]` | 拉历史消息 |
| `rename_session` | `chatId, title` | 改名 |
| `delete_session` | `chatId` | 删会话 |
| `start_asr` / `stop_asr` | – | 流式 ASR（语音转写，binary frame 是 PCM） |
| `ping` | – | app-level ping，服务端回 `pong` |

### 2.4 Server → Client 消息（`ServerMessage` union）

| `type` | 关键字段 | 用途 |
|--------|----------|------|
| `connected` | `bots: BotInfo[]` | 连接成功/拉取 bot 列表 |
| `bots_updated` | `bots: BotInfo[]` | bot 列表变更广播 |
| `state` | `chatId, messageId, state: CardState[, botName, groupId]` | 流式中间态 |
| `complete` | 同上 | 流式结束态（`state` 是终态） |
| `error` | `chatId, messageId?, error` | 错误 |
| `notice` | `chatId, title, content, color?` | 通知（如"任务已停止"） |
| `file` | `chatId, url, name, mimeType, size?` | agent 输出文件 |
| `group_created` / `group_deleted` / `groups_list` | – | 群组 |
| `sessions_list` | `botName, sessions[]` | |
| `session_adopted` | `chatId, sessionId, claudeSessionId?, history[]` | |
| `session_history` | `sessionId, messages[]` | |
| `session_renamed` / `session_deleted` | – | |
| `asr_started` / `asr_transcript` / `asr_error` / `asr_stopped` | – | ASR |
| `pong` | – | 心跳响应 |

### 2.5 `CardState` 核心字段（流式 payload）

```ts
type CardStatus = 'preparing' | 'thinking' | 'running' | 'complete' | 'error' | 'waiting_for_input';

interface CardState {
  status: CardStatus;
  userPrompt: string;
  responseText: string;
  toolCalls: Array<{ name, detail, status: 'running' | 'done', stepIndex? }>;
  durationMs?: number;
  errorMessage?: string;
  pendingQuestion?: PendingQuestion;
  model?: string;
  totalTokens?: number;
  contextWindow?: number;
  sessionCostUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  backgroundEvents?: BackgroundEvent[];
  contextNote?: string;
  currentSkill?: string;
  botName?: string;
  intentName?: string;
}
```

**桌面端 trace 面板直接渲染 `state.responseText` + `state.toolCalls[]` + `state.status`**。

### 2.6 提问交互

服务端 `state.pendingQuestion` 形如：
```ts
{ toolUseId, questions: [{ question, header, options, multiSelect }] }
```
客户端发 `{ type: 'answer', chatId, toolUseId, answer }`。5 分钟不答 → 服务端自动注入 `_timeout` 答案。

### 来源
- `src/web/ws-server.ts` (1011 行)
- `src/types.ts` (`CardState` / `CardStatus` / `ToolCall` / `PendingQuestion`)

---

## 3. 质量审查

**结论：mah 没有专门的 `/api/quality/*` 端点。质量审查是 Lingyan（凌烟阁·总管）agent 的内建 capability，桌面端通过现有 WSS `chat` 流程调用。**

### 3.1 搜索结果

```
$ grep -rniE "quality.{0,5}review|quality_check|review.{0,5}agent" src/ --include="*.ts"
src/skills/skill-registry.ts:538:    '10-quality-reviewer': '质量审核',
src/agents/roles/lingyan.ts:14:        'quality_review',
```

- `10-quality-reviewer` 是 skill registry 里**翻译表**的一项（i18n key），不是端点
- `quality_review` 是 LingyanAgent 的 capability 列表里的一项
- `src/api/routes/` 下**无** `/api/quality*`、`/api/review*`、`/api/risk*` 任何路由

### 3.2 现有最近的端点（候选）

`/api/talk` / `/api/talk/:taskId`（`task-routes.ts`）：
- `POST /api/talk` body: `{ botName, chatId, prompt, sendCards?, async?, callbackChatId?, callbackBotName? }`
- 同步返回最终结果；`async: true` 时返回 `taskId`，走 `/api/talk/:taskId` 轮询

**这是 desktop 应该复用的入口**。对于"质检结果回传"也可以走 `callbackChatId` 把结果推到 WSS 流。

### 3.3 桌面端如何调用"质量审查"

不需要新端点。两条路：

**A. 走 WSS `chat`（推荐）**
```ts
ws.send({
  type: 'chat',
  botName: 'lingyan',           // 凌烟阁·总管，质量审查方
  chatId: 'quality-<uuid>',
  text: '请审查 <artifact>',
  messageId: '<client-uuid>',
});
// 收 state / complete 流，从 CardState.responseText 取审查意见
```

**B. 走 HTTP `/api/talk` 同步调用**
```ts
POST /api/talk
{ botName: 'lingyan', chatId, prompt: '...', sendCards: false, async: true }
// → { taskId }，再 GET /api/talk/:taskId
```

### 3.4 v0.1 桌面端"两段护栏"（RiskGate）实现位置

原计划的"RiskGate 2 道护栏" = **客户端护栏**（Task 5.2），不依赖服务端新端点：
- 护栏 1：local regex / 关键词拦截（敏感词、合同金额、PII）
- 护栏 2：调用 Lingyan agent（`botName: 'lingyan'`）做 AI 复核，未通过则拒绝外发

如果未来需要服务端权威审计 / 留痕，再让 mah 加 `POST /api/quality/review`。

### 3.5 v0.2+ 候选端点

v0.1 桌面端先用 3.3 节的 WSS `chat` 方案打补丁，stub 等 v0.2。v0.2+ 候选端点见 `future-work.md`。

### 来源
- `src/skills/skill-registry.ts:538`
- `src/agents/roles/lingyan.ts:14`
- `src/api/routes/task-routes.ts` (无 quality 子路由)
