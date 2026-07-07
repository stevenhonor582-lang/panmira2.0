# panmira N1 路由清单 (L5-L12)

> 生成时间: 2026-07-07 · HEAD: `c2a9e725`
>
> **本文件作为 OpenAPI 文档的详细补充**,列出所有路由(含待删)、分类、新旧状态、git 信息。
> 机器可读版本见 `docs/openapi.json` (130 paths, OpenAPI 3.0.3)。

---

## Section A: 路由总览表

> 表格按 HTTP method + URL 排序。`Status` 列含义:
> - `keep` — 保留
> - `delete-chat` — chat 相关,待删
> - `delete-team` — team 相关,待删
> - `delete-both` — 同时涉及 chat+team
>
> `New/Old` 列含义:
> - `new` — L5-L12 新增或大改
> - `old` — L5 之前就有

### A.1 KEEP 路由 (OpenAPI 已收录)

| Method | Path | Handler (file) | Status | Category | New/Old | Description |
|---|---|---|---|---|---|---|
| GET | /.well-known/oauth-authorization-server | oauth-routes.ts | keep | oauth | old | RFC 8414 OAuth server metadata |
| GET | /api/auth/feishu/status | auth-routes.ts | keep | auth | old | Feishu OAuth status |
| GET | /api/auth/login | auth-routes.ts | keep | auth | old | Login form / redirect |
| POST | /api/auth/login | auth-routes.ts | keep | auth | old | Submit credentials |
| GET | /api/auth/me | auth-routes.ts | keep | auth | old | Current user info |
| POST | /api/auth/logout | auth-routes.ts | keep | auth | old | Logout |
| POST | /api/auth/refresh | auth-routes.ts | keep | auth | old | Refresh access token |
| POST | /api/auth/register | auth-routes.ts | keep | auth | old | Register new user |
| POST | /api/auth/feishu/callback | auth-routes.ts | keep | auth | old | Feishu OAuth callback |
| POST | /api/auth/feishu/connect | auth-routes.ts | keep | auth | old | Connect Feishu |
| POST | /api/auth/feishu/disconnect | auth-routes.ts | keep | auth | old | Disconnect Feishu |
| POST | /api/auth/forgot-password | auth-routes.ts | keep | auth | old | Request password reset |
| POST | /api/auth/reset-password | auth-routes.ts | keep | auth | old | Reset password |
| GET | /api/auth/verify-email | auth-routes.ts | keep | auth | old | Verify email |
| GET | /api/auth/users | auth-routes.ts | keep | auth | old | List users |
| GET | /api/upload | file-routes.ts | keep | files | old | Upload file |
| GET | /api/files/&lt;path&gt; | file-routes.ts | keep | files | old | Stream file |
| GET | /api/knowledge | knowledge-routes.ts | keep | knowledge | old | List KBs |
| POST | /api/knowledge | knowledge-routes.ts | keep | knowledge | old | Create KB |
| GET | /api/knowledge/{id} | knowledge-routes.ts | keep | knowledge | old | Get KB |
| PATCH | /api/knowledge/{id} | knowledge-routes.ts | keep | knowledge | old | Update KB |
| DELETE | /api/knowledge/{id} | knowledge-routes.ts | keep | knowledge | old | Delete KB |
| POST | /api/knowledge/{id}/search | knowledge-routes.ts | keep | knowledge | old | Search KB (vector) |
| POST | /api/knowledge/{id}/upload | knowledge-routes.ts | keep | knowledge | old | Upload doc to KB |
| GET | /api/knowledge/{id}/documents | knowledge-routes.ts | keep | knowledge | old | List KB docs |
| GET | /api/knowledge-base/{id} | knowledge-base-routes.ts | keep | knowledge | old | Get KB (alt path) |
| GET | /api/memory | memory-routes.ts | keep | memory | old | List memories |
| POST | /api/memory/extract | memory-routes.ts | keep | memory | old | Trigger extraction |
| POST | /api/memory/{id}/feedback | memory-routes.ts | keep | memory | old | Memory feedback |
| GET | /api/providers | provider-routes.ts | keep | providers | old | List LLM providers |
| POST | /api/providers | provider-routes.ts | keep | providers | old | Create provider |
| GET | /api/providers/{id} | provider-routes.ts | keep | providers | old | Get provider |
| PATCH | /api/providers/{id} | provider-routes.ts | keep | providers | old | Update provider |
| DELETE | /api/providers/{id} | provider-routes.ts | keep | providers | old | Delete provider |
| GET | /api/tenants | (admin-routes) | keep | tenants | old | List tenants |
| POST | /api/tenants | (admin-routes) | keep | tenants | old | Create tenant |
| GET | /api/tenants/{id} | (admin-routes) | keep | tenants | old | Get tenant |
| PATCH | /api/tenants/{id} | (admin-routes) | keep | tenants | old | Update tenant |
| GET | /api/users | (workspace-routes) | keep | users | old | List users |
| POST | /api/users | (workspace-routes) | keep | users | old | Create user |
| GET | /api/users/{id} | (workspace-routes) | keep | users | old | Get user |
| PATCH | /api/users/{id} | (workspace-routes) | keep | users | old | Update user |
| DELETE | /api/users/{id} | (workspace-routes) | keep | users | old | Delete user |
| GET | /api/workspace/group/{groupId} | workspace-routes.ts | keep | workspace | old | Get workspace group |
| GET | /api/workspace/group/{groupId}/documents | workspace-routes.ts | keep | workspace | old | List group docs |
| POST | /api/workspace/group/{groupId}/documents | workspace-routes.ts | keep | workspace | old | Add group doc |
| DELETE | /api/workspace/group/{groupId}/documents/{docId} | workspace-routes.ts | keep | workspace | old | Remove group doc |
| GET | /api/workspace/{botName}/projects | workspace-routes.ts | keep | projects | old | List bot projects |
| POST | /api/workspace/{botName}/projects/{projectName}/documents | workspace-routes.ts | keep | projects | old | Add project doc |
| GET | /api/workspace/{botName}/projects/{projectName}/documents | workspace-routes.ts | keep | projects | old | List project docs |
| GET | /api/workspace/index/{scope} | workspace-routes.ts | keep | workspace | old | Workspace index |
| GET | /api/projects | project-routes.ts | keep | projects | old | List projects |
| POST | /api/projects | project-routes.ts | keep | projects | old | Create project |
| GET | /api/projects/{id} | project-routes.ts | keep | projects | old | Get project |
| PATCH | /api/projects/{id} | project-routes.ts | keep | projects | old | Update project |
| DELETE | /api/projects/{id} | project-routes.ts | keep | projects | old | Delete project |
| GET | /api/bots | bot-routes.ts | keep | bots | old | List bots (⚠️ 非 chat 部分) |
| POST | /api/bots | bot-routes.ts | keep | bots | old | Create bot (⚠️ 非 chat) |
| GET | /api/bots/{name} | bot-routes.ts | keep | bots | old | Get bot (⚠️ 非 chat) |
| PUT | /api/bots/{name} | bot-routes.ts | keep | bots | old | Update bot |
| DELETE | /api/bots/{name} | bot-routes.ts | keep | bots | old | Delete bot |
| GET | /api/bots/{name}/profile | bot-routes.ts | keep | bots | old | Bot profile |
| POST | /api/bots/{name}/pause | bot-routes.ts | keep | bots | old | Pause bot |
| POST | /api/bots/{name}/resume | bot-routes.ts | keep | bots | old | Resume bot |
| GET | /api/peers | bot-routes.ts | keep | bots | old | List peer bots |
| GET | /api/memories | bot-routes.ts | keep | bots | old | List bot memories |
| GET | /api/memories/stats | bot-routes.ts | keep | bots | old | Memory stats |
| GET | /api/activity/events | (admin-routes) | keep | activity | old | Activity events log |
| GET | /api/templates | template-routes.ts | keep | templates | old | List templates |
| GET | /api/templates/{name} | template-routes.ts | keep | templates | old | Get template |
| POST | /api/templates | template-routes.ts | keep | templates | old | Create template |
| PUT | /api/templates/{name} | template-routes.ts | keep | templates | old | Update template |
| DELETE | /api/templates/{name} | template-routes.ts | keep | templates | old | Delete template |
| GET | /api/tasks | task-routes.ts | keep | tasks | old | List tasks |
| POST | /api/tasks | task-routes.ts | keep | tasks | old | Create task |
| GET | /api/tasks/{id} | task-routes.ts | keep | tasks | old | Get task |
| PATCH | /api/tasks/{id} | task-routes.ts | keep | tasks | old | Update task |
| DELETE | /api/tasks/{id} | task-routes.ts | keep | tasks | old | Delete task |
| GET | /api/sync/config | sync-routes.ts | keep | sync | old | Get sync config |
| PATCH | /api/sync/config | sync-routes.ts | keep | sync | old | Update sync config |
| POST | /api/sync/run | sync-routes.ts | keep | sync | old | Run sync |
| GET | /api/sync/history | sync-routes.ts | keep | sync | old | Sync history |
| GET | /api/sessions | session-routes.ts | keep | session | old | List sessions |
| POST | /api/sessions | session-routes.ts | keep | session | old | Create session |
| GET | /api/sessions/{id} | session-routes.ts | keep | session | old | Get session |
| DELETE | /api/sessions/{id} | session-routes.ts | keep | session | old | Delete session |
| POST | /api/sessions/{id}/messages | session-routes.ts | keep | session | old | Add session message |
| GET | /api/sessions/{id}/messages | session-routes.ts | keep | session | old | Get session messages |
| POST | /api/rtc/rooms | rtc-routes.ts | keep | rtc | old | Create RTC room |
| POST | /api/rtc/rooms/{id}/join | rtc-routes.ts | keep | rtc | old | Join RTC room |
| DELETE | /api/rtc/rooms/{id} | rtc-routes.ts | keep | rtc | old | Close RTC room |
| POST | /api/voice | voice-routes.ts | keep | voice | old | Voice message |
| POST | /api/tts | voice-routes.ts | keep | voice | old | TTS |
| GET | /api/resource/usage | resource-routes.ts | keep | resource | old | Resource usage |
| GET | /api/resource/balance | resource-routes.ts | keep | resource | old | Resource balance |
| POST | /api/resource/topup | resource-routes.ts | keep | resource | old | Top up |
| GET | /api/oauth/clients | oauth-client-routes.ts | keep | oauth-client | old | List OAuth clients |
| POST | /api/oauth/clients | oauth-client-routes.ts | keep | oauth-client | old | Create OAuth client |
| GET | /api/oauth/clients/{id} | oauth-client-routes.ts | keep | oauth-client | old | Get OAuth client |
| PATCH | /api/oauth/clients/{id} | oauth-client-routes.ts | keep | oauth-client | old | Update OAuth client |
| DELETE | /api/oauth/clients/{id} | oauth-client-routes.ts | keep | oauth-client | old | Delete OAuth client |
| POST | /api/oauth/clients/{id}/rotate-secret | oauth-client-routes.ts | keep | oauth-client | old | Rotate client secret |
| GET | /api/oauth/scopes | oauth-client-routes.ts | keep | oauth-client | old | List scopes |
| GET | /api/v1/agent/list | agent-routes.ts | keep | agents | old | List agents (bot-scoped) |
| POST | /api/v1/agent/execute | agent-routes.ts | keep | agents | old | Execute intent |
| GET | /api/v1/approval | agent-routes.ts | keep | agents | old | List approvals |
| POST | /api/v1/approval/{id} | agent-routes.ts | keep | agents | old | Approve/reject |
| GET | /api/v2/agents | agents-crud-routes.ts | keep | agents | **new (L9)** | List agents |
| POST | /api/v2/agents | agents-crud-routes.ts | keep | agents | **new (L9)** | Create agent (race/first/all strategy) |
| GET | /api/v2/agents/{id} | agents-crud-routes.ts | keep | agents | **new (L9)** | Get agent |
| PATCH | /api/v2/agents/{id} | agents-crud-routes.ts | keep | agents | **new (L9)** | Update agent |
| DELETE | /api/v2/agents/{id} | agents-crud-routes.ts | keep | agents | **new (L9)** | Delete agent |
| POST | /api/v2/agents/{id}/run | agent-run-routes.ts | keep | agents | old | Run agent (RAG-aware) |
| GET | /api/v2/agents/{id}/knowledge-refs | agent-knowledge-routes.ts | keep | agents | old | List KB refs |
| POST | /api/v2/agents/{id}/knowledge-refs | agent-knowledge-routes.ts | keep | agents | old | Add KB ref |
| DELETE | /api/v2/agents/{id}/knowledge-refs/{refId} | agent-knowledge-routes.ts | keep | agents | old | Remove KB ref |
| GET | /api/v2/admin/agent-run-logs | agent-run-logs-routes.ts | keep | agent-runs | old | List run logs |
| GET | /api/v2/admin/agent-run-logs/stats | agent-run-logs-routes.ts | keep | agent-runs | old | Run log stats |
| GET | /api/v2/admin/pipelines | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | List pipelines |
| POST | /api/v2/admin/pipelines | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | Create pipeline (L8 retry policy) |
| GET | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | Get pipeline |
| PATCH | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | Update pipeline |
| DELETE | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | Delete pipeline |
| POST | /api/v2/admin/pipelines/{id}/trigger | pipeline-routes.ts | keep | **pipelines** | **new (L5-L8)** | Trigger pipeline (L6 async, L7 WS progress) |
| GET | /api/v2/admin/pipelines/{id}/runs | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | List runs |
| GET | /api/v2/admin/pipelines/{id}/runs/{runId} | pipeline-routes.ts | keep | **pipelines** | **new (L5)** | Get run |
| POST | /api/v2/admin/pipelines/cache/invalidate | admin-cache-routes.ts | keep | **admin-pipelines** | **new (Phase 4 L3 Fix 3)** | Invalidate pipeline cache |
| GET | /api/v2/admin/scheduled-jobs | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | List jobs |
| POST | /api/v2/admin/scheduled-jobs | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | Create job |
| GET | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | Get job |
| PATCH | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | Update job |
| DELETE | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | Delete job |
| POST | /api/v2/admin/scheduled-jobs/{id}/trigger | scheduled-jobs-routes.ts | keep | scheduled-jobs | old | Trigger job |
| GET | /api/v2/admin/skill-dags | skill-dag-routes.ts | keep | skill-dags | old | List skill DAGs |
| POST | /api/v2/admin/skill-dags | skill-dag-routes.ts | keep | skill-dags | old | Create skill DAG |
| GET | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | keep | skill-dags | old | Get skill DAG |
| PUT | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | keep | skill-dags | old | Update skill DAG |
| DELETE | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | keep | skill-dags | old | Delete skill DAG |
| GET | /api/skills/catalog | skill-catalog-routes.ts | keep | skill-catalog | old | Browse catalog |
| GET | /api/skills/catalog/{id} | skill-catalog-routes.ts | keep | skill-catalog | old | Get catalog entry |
| POST | /api/skills/catalog/{id}/install | skill-catalog-routes.ts | keep | skill-catalog | old | Install from catalog |
| GET | /api/skill-hub | skill-hub-routes.ts | keep | skill-hub | old | Skill hub dashboard |
| GET | /api/skill-hub/categories | skill-hub-routes.ts | keep | skill-hub | old | List categories |
| GET | /api/skill-hub/search | skill-hub-routes.ts | keep | skill-hub | old | Search skills |
| POST | /api/skill-hub/{id}/rate | skill-hub-routes.ts | keep | skill-hub | old | Rate skill |
| GET | /api/v2/admin/embedding-jobs/{id} | embedding-jobs-routes.ts | keep | embedding-jobs | old | Get embedding job status |
| GET | /api/v2/admin/models | models-pool-routes.ts | keep | models | old | List models |
| POST | /api/v2/admin/models | models-pool-routes.ts | keep | models | old | Create model |
| POST | /api/v2/admin/models/{id}/test | models-pool-routes.ts | keep | models | old | Test model |
| PATCH | /api/v2/admin/models/{id} | models-pool-routes.ts | keep | models | old | Update model |
| GET | /api/v2/admin/tenants/{tenantId}/quotas | tenant-quota-routes.ts | keep | tenants-quota | old | List tenant quotas |
| POST | /api/v2/admin/tenants/{tenantId}/quotas | tenant-quota-routes.ts | keep | tenants-quota | old | Create tenant quota |
| PATCH | /api/v2/admin/tenants/{tenantId}/quotas/{id} | tenant-quota-routes.ts | keep | tenants-quota | old | Update quota |
| DELETE | /api/v2/admin/tenants/{tenantId}/quotas/{id} | tenant-quota-routes.ts | keep | tenants-quota | old | Delete quota |
| GET | /api/v2/admin/dashboard/stats | dashboard-routes.ts | keep | admin-dashboard | old | Dashboard stats |
| GET | /api/v2/admin/status | monitoring-routes.ts | keep | admin-status | old | System status |
| GET | /api/v2/admin/alerts | monitoring-routes.ts | keep | admin-alerts | old | Active alerts |
| GET | /api/v2/admin/diagnose/{taskId} | monitoring-routes.ts | keep | admin-diagnose | old | Diagnose task |
| GET | /api/v2/admin/audit | ops-routes.ts | keep | admin-audit | old | Audit log |
| GET | /api/v2/admin/cost | ops-routes.ts | keep | admin-cost | old | Cost metrics |
| POST | /api/v2/admin/rate-limit/override | admin-ratelimit-routes.ts | keep | admin-ratelimit | **new (L4 Phase 4)** | Set rate limit override |
| DELETE | /api/v2/admin/rate-limit/override/{userId} | admin-ratelimit-routes.ts | keep | admin-ratelimit | **new (L4 Phase 4)** | Clear override |
| GET | /api/v2/admin/rate-limit/inspect/{userId} | admin-ratelimit-routes.ts | keep | admin-ratelimit | **new (L4 Phase 4)** | Inspect rate limit |
| GET | /api/v2/admin/channels | channels-routes.ts | keep | admin-channels | old | List channels |
| POST | /api/v2/admin/channels | channels-routes.ts | keep | admin-channels | old | Create channel |
| DELETE | /api/v2/admin/channels/{id} | channels-routes.ts | keep | admin-channels | old | Delete channel |
| POST | /api/v2/admin/channels/usage | channel-usage-routes.ts | keep | channel-usage | old | Record channel usage |
| GET | /api/v2/admin/reports/{dimension} | reports-routes.ts | keep | reports | old | Get reports |
| GET | /api/v2/admin/reports/{dimension}/export | reports-export-routes.ts | keep | reports-export | old | Export CSV |
| POST | /api/v2/admin/generate | generate-routes.ts | keep | admin-generate | old | AI generate |
| GET | /api/v2/admin/generate/{id} | generate-routes.ts | keep | admin-generate | old | Get generation result |
| POST | /api/v2/admin/maintenance/cleanup | maintenance-routes.ts | keep | maintenance | old | Cleanup |
| POST | /api/v2/admin/maintenance/reindex | maintenance-routes.ts | keep | maintenance | old | Reindex |
| POST | /api/v2/admin/maintenance/backup | maintenance-routes.ts | keep | maintenance | old | Backup |
| GET | /oauth/jwks | oauth-routes.ts | keep | oauth | old | JWKS |
| POST | /oauth/revoke | oauth-routes.ts | keep | oauth | old | Token revocation |
| GET | /oauth/authorize | oauth-routes.ts | keep | oauth | old | Authorize |
| POST | /oauth/authorize/confirm | oauth-routes.ts | keep | oauth | old | Confirm auth |
| POST | /oauth/token | oauth-routes.ts | keep | oauth | old | Token endpoint |
| GET | /oauth/userinfo | oauth-routes.ts | keep | oauth | old | OIDC userinfo |

### A.2 DELETE-TEAM 路由 (待删,不进入 OpenAPI)

| Method | Path | Handler (file) | Status | Category | New/Old | Description |
|---|---|---|---|---|---|---|
| GET | /api/team/status | team-routes.ts | delete-team | team | old | Team status (待删) |
| POST | /api/route | team-routes.ts | delete-team | team | old | Route message to bot (待删) |
| GET | /api/router/mode | team-routes.ts | delete-team | team | old | Router mode |
| PUT | /api/router/mode | team-routes.ts | delete-team | team | old | Set router mode |
| GET | /api/budgets | team-routes.ts | delete-team | team | old | List budgets |
| PUT | /api/budgets/{botName} | team-routes.ts | delete-team | team | old | Set budget |
| GET | /api/costs/report | team-routes.ts | delete-team | team | old | Cost report |
| GET | /api/circuits | team-routes.ts | delete-team | team | old | List circuits |
| POST | /api/circuits/{botName}/reset | team-routes.ts | delete-team | team | old | Reset circuit |
| GET | /api/teams | team-routes.ts | delete-team | team | old | List teams |
| POST | /api/teams | team-routes.ts | delete-team | team | old | Create team |
| GET | /api/teams/{id} | team-routes.ts | delete-team | team | old | Get team |
| PUT | /api/teams/{id} | team-routes.ts | delete-team | team | old | Update team |
| DELETE | /api/teams/{id} | team-routes.ts | delete-team | team | old | Delete team |
| POST | /api/meetings | team-routes.ts | delete-team | team | old | Create meeting |
| GET | /api/meetings | team-routes.ts | delete-team | team | old | List meetings |
| GET | /api/meetings/{id} | team-routes.ts | delete-team | team | old | Get meeting |
| GET | /api/coordinator/discovered-groups | team-routes.ts | delete-team | team | old | Discovered groups |
| GET | /api/coordinator/discovered-groups/{chatId}/bots | team-routes.ts | delete-team | team | old | Group bots |
| GET | /api/coordinator/configs | team-routes.ts | delete-team | team | old | Coordinator configs |
| GET | /api/coordinator/configs/{groupId} | team-routes.ts | delete-team | team | old | Get config |
| PUT | /api/coordinator/configs/{groupId} | team-routes.ts | delete-team | team | old | Set config |
| DELETE | /api/coordinator/configs/{groupId} | team-routes.ts | delete-team | team | old | Delete config |
| GET | /api/voice-identities | team-routes.ts | delete-team | team | old | List voice identities |
| POST | /api/voice-identities | team-routes.ts | delete-team | team | old | Create voice identity |
| DELETE | /api/voice-identities/{id} | team-routes.ts | delete-team | team | old | Delete voice identity |

> 备注: `team-routes.ts` 文件共 27 个 routes,其中 **26 个 delete-team + 1 个 keep** (activity/events 已转 keep)。
> delete-team 子集:`/api/coordinator/*` (6 routes) + `/api/voice-identities/*` (3 routes) + `/api/team*` + `/api/route*` + `/api/router/*` + `/api/budgets/*` + `/api/costs/*` + `/api/circuits/*` + `/api/teams/*` + `/api/meetings/*` (16 routes)。
> keep:`/api/activity/events` (activity log 本质,与 team 解耦)。

### A.3 DELETE-CHAT 路由 (待删,不进入 OpenAPI)

> 这些路由主要在 `bot-routes.ts` 和 `binding-routes.ts` 中,**chat 相关** 部分的子集;
> 实际"待删"的是 `ws-server.ts` 中的 message type,见 Section B WS 部分。
>
> `binding-routes.ts` 中 `/api/bindings*` 服务于 chat group → bot 路由,已确认归 delete-chat (2026-07-07)。

| Method | Path | Handler (file) | Status | Category | New/Old | Description |
|---|---|---|---|---|---|---|
| GET | /api/bindings | binding-routes.ts | delete-chat | bot-bindings | old | List bindings (chat group → bot) |
| POST | /api/bindings | binding-routes.ts | delete-chat | bot-bindings | old | Create binding (chat group → bot) |
| PUT | /api/bindings/{id} | binding-routes.ts | delete-chat | bot-bindings | old | Update binding (chat group → bot) |
| DELETE | /api/bindings/{id} | binding-routes.ts | delete-chat | bot-bindings | old | Delete binding (chat group → bot) |
| GET | /api/files/preview/{chatId} | file-routes.ts | delete-chat | files | old | File preview (chatId 维度) |

### A.4 WS Message Types (ws-server.ts)

| Direction | Type | Status | Description |
|---|---|---|---|
| C→S | chat | **delete-chat** | 客户端发送 chat 消息(待删) |
| C→S | proxy_message | **delete-chat** | 代理消息(待删) |
| C→S | group_chat | **delete-chat** | 群聊消息(待删) |
| C→S | create_group | **delete-chat** | 创建群组(待删) |
| C→S | delete_group | **delete-chat** | 删除群组(待删) |
| C→S | list_groups | **delete-chat** | 列出群组(待删) |
| C→S | subscribe_group | **delete-chat** | 订阅群组(待删) |
| C→S | stop | **delete-chat** | 停止 chat(待删) |
| C→S | answer | **delete-chat** | 回答 tool use(待删) |
| S→C | state | **delete-chat** | Card state 推送(待删) |
| S→C | complete | **delete-chat** | 完成推送(待删) |
| S→C | error | **delete-chat** | 错误推送(待删) |
| S→C | notice | **delete-chat** | 通知(待删) |
| S→C | file | **delete-chat** | 文件推送(待删) |
| S→C | group_created | **delete-chat** | 群组创建事件(待删) |
| S→C | group_deleted | **delete-chat** | 群组删除事件(待删) |
| S→C | groups_list | **delete-chat** | 群组列表(待删) |
| C→S | resume | keep | 恢复 sessions(保留) |
| C→S | list_sessions | keep | 列出 sessions(保留) |
| C→S | adopt_session | keep | 采用 session(保留) |
| C→S | get_session_history | keep | session history(保留) |
| C→S | rename_session | keep | 重命名 session(保留) |
| C→S | delete_session | keep | 删除 session(保留) |
| C→S | start_asr | keep | 开始 ASR(保留) |
| C→S | stop_asr | keep | 停止 ASR(保留) |
| S→C | pipeline_progress | keep (NEW L7) | pipeline 进度推送 (L7 `ba8af6fb` / L10 `76ccb2c1` 强化) |
| S→C | session_adopted | keep | session 被采用(保留) |
| S→C | session_history | keep | session history 推送(保留) |
| S→C | session_renamed | keep | session 重命名(保留) |
| S→C | session_deleted | keep | session 删除(保留) |
| S→C | sessions_list | keep | session 列表(保留) |
| S→C | asr_started | keep | ASR 启动(保留) |
| S→C | asr_transcript | keep | ASR 文本(保留) |
| S→C | asr_error | keep | ASR 错误(保留) |
| S→C | asr_stopped | keep | ASR 停止(保留) |
| C→S | ping | keep | 心跳(保留) |
| S→C | pong | keep | 心跳响应(保留) |
| S→C | connected | keep | 连接确认(保留) |
| S→C | bots_updated | keep | bot 列表更新(保留) |

> 备注: 19 个 message types 标 **delete-chat**,19 个标 **keep**。
> L7 (`ba8af6fb`) + L10 (`76ccb2c1`) 新增的 `pipeline_progress` 事件保留,服务于 Pipeline 进度条 UI。

---

## Section B: 按 category 分组

### KEEP (admin/oauth/auth)

| Method | Path | File | Description |
|---|---|---|---|
| GET | /.well-known/oauth-authorization-server | oauth-routes.ts | OAuth server metadata |
| GET | /oauth/jwks | oauth-routes.ts | JWKS |
| POST | /oauth/revoke | oauth-routes.ts | Token revoke |
| GET | /oauth/authorize | oauth-routes.ts | Authorize |
| POST | /oauth/authorize/confirm | oauth-routes.ts | Confirm auth |
| POST | /oauth/token | oauth-routes.ts | Token endpoint |
| GET | /oauth/userinfo | oauth-routes.ts | Userinfo |
| GET | /api/oauth/clients | oauth-client-routes.ts | List OAuth clients |
| POST | /api/oauth/clients | oauth-client-routes.ts | Create OAuth client |
| GET | /api/oauth/clients/{id} | oauth-client-routes.ts | Get client |
| PATCH | /api/oauth/clients/{id} | oauth-client-routes.ts | Update client |
| DELETE | /api/oauth/clients/{id} | oauth-client-routes.ts | Delete client |
| POST | /api/oauth/clients/{id}/rotate-secret | oauth-client-routes.ts | Rotate secret |
| GET | /api/oauth/scopes | oauth-client-routes.ts | List scopes |
| GET | /api/auth/login | auth-routes.ts | Login form |
| POST | /api/auth/login | auth-routes.ts | Submit login |
| POST | /api/auth/logout | auth-routes.ts | Logout |
| POST | /api/auth/refresh | auth-routes.ts | Refresh token |
| GET | /api/auth/me | auth-routes.ts | Current user |
| POST | /api/auth/register | auth-routes.ts | Register |
| POST | /api/auth/feishu/connect | auth-routes.ts | Feishu connect |
| POST | /api/auth/feishu/callback | auth-routes.ts | Feishu callback |
| GET | /api/auth/feishu/status | auth-routes.ts | Feishu status |
| POST | /api/auth/feishu/disconnect | auth-routes.ts | Feishu disconnect |
| POST | /api/auth/forgot-password | auth-routes.ts | Forgot |
| POST | /api/auth/reset-password | auth-routes.ts | Reset |
| GET | /api/auth/verify-email | auth-routes.ts | Verify email |
| GET | /api/auth/users | auth-routes.ts | List users |
| GET | /api/tenants | (admin-routes) | List tenants |
| POST | /api/tenants | (admin-routes) | Create tenant |
| GET | /api/tenants/{id} | (admin-routes) | Get tenant |
| PATCH | /api/tenants/{id} | (admin-routes) | Update tenant |
| GET | /api/users | (workspace) | List users |
| POST | /api/users | (workspace) | Create user |
| GET | /api/users/{id} | (workspace) | Get user |
| PATCH | /api/users/{id} | (workspace) | Update user |
| DELETE | /api/users/{id} | (workspace) | Delete user |
| GET | /api/activity/events | (admin-routes) | Activity events log |
| GET | /api/v2/admin/dashboard/stats | dashboard-routes.ts | Dashboard stats |
| GET | /api/v2/admin/status | monitoring-routes.ts | System status |
| GET | /api/v2/admin/alerts | monitoring-routes.ts | Active alerts |
| GET | /api/v2/admin/diagnose/{taskId} | monitoring-routes.ts | Diagnose |
| GET | /api/v2/admin/audit | ops-routes.ts | Audit log |
| GET | /api/v2/admin/cost | ops-routes.ts | Cost metrics |
| POST | /api/v2/admin/rate-limit/override | admin-ratelimit-routes.ts | Set rate limit override (L4) |
| DELETE | /api/v2/admin/rate-limit/override/{userId} | admin-ratelimit-routes.ts | Clear override (L4) |
| GET | /api/v2/admin/rate-limit/inspect/{userId} | admin-ratelimit-routes.ts | Inspect (L4) |
| GET | /api/v2/admin/channels | channels-routes.ts | List channels |
| POST | /api/v2/admin/channels | channels-routes.ts | Create channel |
| DELETE | /api/v2/admin/channels/{id} | channels-routes.ts | Delete channel |
| POST | /api/v2/admin/channels/usage | channel-usage-routes.ts | Record usage |
| GET | /api/v2/admin/reports/{dimension} | reports-routes.ts | Get reports |
| GET | /api/v2/admin/reports/{dimension}/export | reports-export-routes.ts | Export CSV |
| POST | /api/v2/admin/generate | generate-routes.ts | AI generate |
| GET | /api/v2/admin/generate/{id} | generate-routes.ts | Get result |
| POST | /api/v2/admin/maintenance/cleanup | maintenance-routes.ts | Cleanup |
| POST | /api/v2/admin/maintenance/reindex | maintenance-routes.ts | Reindex |
| POST | /api/v2/admin/maintenance/backup | maintenance-routes.ts | Backup |

### KEEP (agents)

| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/v1/agent/list | agent-routes.ts | List agents (bot-scoped) |
| POST | /api/v1/agent/execute | agent-routes.ts | Execute intent |
| GET | /api/v1/approval | agent-routes.ts | List approvals |
| POST | /api/v1/approval/{id} | agent-routes.ts | Approve/reject |
| GET | /api/v2/agents | agents-crud-routes.ts | List agents (L9) |
| POST | /api/v2/agents | agents-crud-routes.ts | Create agent (L9) |
| GET | /api/v2/agents/{id} | agents-crud-routes.ts | Get agent (L9) |
| PATCH | /api/v2/agents/{id} | agents-crud-routes.ts | Update agent (L9) |
| DELETE | /api/v2/agents/{id} | agents-crud-routes.ts | Delete agent (L9) |
| POST | /api/v2/agents/{id}/run | agent-run-routes.ts | Run agent (RAG) |
| GET | /api/v2/agents/{id}/knowledge-refs | agent-knowledge-routes.ts | List KB refs |
| POST | /api/v2/agents/{id}/knowledge-refs | agent-knowledge-routes.ts | Add KB ref |
| DELETE | /api/v2/agents/{id}/knowledge-refs/{refId} | agent-knowledge-routes.ts | Remove KB ref |
| GET | /api/v2/admin/agent-run-logs | agent-run-logs-routes.ts | List run logs |
| GET | /api/v2/admin/agent-run-logs/stats | agent-run-logs-routes.ts | Run log stats |

### KEEP (pipelines) — L5-L12 新增 (核心改动)

| Method | Path | File | L# | Description |
|---|---|---|---|---|
| GET | /api/v2/admin/pipelines | pipeline-routes.ts | L5 | List pipelines |
| POST | /api/v2/admin/pipelines | pipeline-routes.ts | L5+**L8** | Create pipeline (L8 retry policy) |
| GET | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | L5 | Get pipeline |
| PATCH | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | L5 | Update pipeline |
| DELETE | /api/v2/admin/pipelines/{id} | pipeline-routes.ts | L5 | Delete pipeline |
| POST | /api/v2/admin/pipelines/{id}/trigger | pipeline-routes.ts | L5+**L6**+L7+**L8** | Trigger (L6 async, L7 WS, L8 retry) |
| GET | /api/v2/admin/pipelines/{id}/runs | pipeline-routes.ts | L5 | List runs |
| GET | /api/v2/admin/pipelines/{id}/runs/{runId} | pipeline-routes.ts | L5 | Get run |
| POST | /api/v2/admin/pipelines/cache/invalidate | admin-cache-routes.ts | **Phase 4 L3 Fix 3** | Invalidate cache |
| GET | /api/v2/admin/scheduled-jobs | scheduled-jobs-routes.ts | old | List jobs |
| POST | /api/v2/admin/scheduled-jobs | scheduled-jobs-routes.ts | old | Create job |
| GET | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | old | Get job |
| PATCH | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | old | Update job |
| DELETE | /api/v2/admin/scheduled-jobs/{id} | scheduled-jobs-routes.ts | old | Delete job |
| POST | /api/v2/admin/scheduled-jobs/{id}/trigger | scheduled-jobs-routes.ts | old | Trigger job |
| GET | /api/v2/admin/skill-dags | skill-dag-routes.ts | old | List skill DAGs |
| POST | /api/v2/admin/skill-dags | skill-dag-routes.ts | old | Create skill DAG |
| GET | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | old | Get skill DAG |
| PUT | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | old | Update skill DAG |
| DELETE | /api/v2/admin/skill-dags/{id} | skill-dag-routes.ts | old | Delete skill DAG |

### KEEP (knowledge)

| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/knowledge | knowledge-routes.ts | List KBs |
| POST | /api/knowledge | knowledge-routes.ts | Create KB |
| GET | /api/knowledge/{id} | knowledge-routes.ts | Get KB |
| PATCH | /api/knowledge/{id} | knowledge-routes.ts | Update KB |
| DELETE | /api/knowledge/{id} | knowledge-routes.ts | Delete KB |
| POST | /api/knowledge/{id}/search | knowledge-routes.ts | Search KB |
| POST | /api/knowledge/{id}/upload | knowledge-routes.ts | Upload doc |
| GET | /api/knowledge/{id}/documents | knowledge-routes.ts | List KB docs |
| GET | /api/knowledge-base/{id} | knowledge-base-routes.ts | Get KB (alt) |
| GET | /api/v2/admin/embedding-jobs/{id} | embedding-jobs-routes.ts | Embedding job status |
| GET | /api/memory | memory-routes.ts | List memories |
| POST | /api/memory/extract | memory-routes.ts | Trigger extraction |
| POST | /api/memory/{id}/feedback | memory-routes.ts | Memory feedback |

### KEEP (bot-management) (非 chat 部分)

| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/bots | bot-routes.ts | List bots (admin/management) |
| POST | /api/bots | bot-routes.ts | Create bot |
| GET | /api/bots/{name} | bot-routes.ts | Get bot |
| PUT | /api/bots/{name} | bot-routes.ts | Update bot |
| DELETE | /api/bots/{name} | bot-routes.ts | Delete bot |
| GET | /api/bots/{name}/profile | bot-routes.ts | Bot profile |
| POST | /api/bots/{name}/pause | bot-routes.ts | Pause bot |
| POST | /api/bots/{name}/resume | bot-routes.ts | Resume bot |
| GET | /api/peers | bot-routes.ts | List peer bots |
| GET | /api/memories | bot-routes.ts | List bot memories |
| GET | /api/memories/stats | bot-routes.ts | Memory stats |

### KEEP (其他)

| Tag | Method | Path | Description |
|---|---|---|---|
| providers | GET/POST/GET/PATCH/DELETE | /api/providers[/{id}] | LLM provider CRUD |
| models | GET/POST/POST/PATCH | /api/v2/admin/models[/{id}[/test]] | Model pool |
| tenants-quota | GET/POST/PATCH/DELETE | /api/v2/admin/tenants/{tenantId}/quotas[/{id}] | Quota CRUD |
| templates | GET/POST/GET/PUT/DELETE | /api/templates[/{name}] | Templates |
| tasks | GET/POST/GET/PATCH/DELETE | /api/tasks[/{id}] | Tasks |
| sync | GET/PATCH/POST/GET | /api/sync/* | Sync |
| session | GET/POST/GET/DELETE/POST/GET | /api/sessions[/{id}[/messages]] | Sessions |
| rtc | POST/POST/DELETE | /api/rtc/rooms[/{id}/join] | RTC |
| voice | POST/POST | /api/voice, /api/tts | Voice |
| resource | GET/GET/POST | /api/resource/* | Billing |
| skill-catalog | GET/GET/POST | /api/skills/catalog/* | Catalog |
| skill-hub | GET/GET/GET/POST | /api/skill-hub/* | Hub |
| files | POST/GET/GET | /api/upload, /api/files/* | Files |
| workspace | GET/GET/POST/DELETE | /api/workspace/group/* | Workspace groups |
| projects | GET/POST/GET/PATCH/DELETE | /api/projects[/{id}], /api/workspace/{bot}/projects/* | Projects |

### DELETE-TEAM (待删)

> 整个 `team-routes.ts` 文件,共 27 条 routes,标注为 "team, 待删除"。

| Method | Path | Description |
|---|---|---|
| GET | /api/team/status | Team status |
| POST | /api/route | Route message |
| GET | /api/router/mode | Router mode |
| PUT | /api/router/mode | Set router mode |
| GET | /api/budgets | List budgets |
| PUT | /api/budgets/{botName} | Set budget |
| GET | /api/costs/report | Cost report |
| GET | /api/circuits | List circuits |
| POST | /api/circuits/{botName}/reset | Reset circuit |
| GET | /api/teams | List teams |
| POST | /api/teams | Create team |
| GET | /api/teams/{id} | Get team |
| PUT | /api/teams/{id} | Update team |
| DELETE | /api/teams/{id} | Delete team |
| POST | /api/meetings | Create meeting |
| GET | /api/meetings | List meetings |
| GET | /api/meetings/{id} | Get meeting |
| GET | /api/coordinator/discovered-groups | Discovered groups |
| GET | /api/coordinator/discovered-groups/{chatId}/bots | Group bots |
| GET | /api/coordinator/configs | Coordinator configs |
| GET | /api/coordinator/configs/{groupId} | Get config |
| PUT | /api/coordinator/configs/{groupId} | Set config |
| DELETE | /api/coordinator/configs/{groupId} | Delete config |
| GET | /api/voice-identities | List voice identities |
| POST | /api/voice-identities | Create voice identity |
| DELETE | /api/voice-identities/{id} | Delete voice identity |

### DELETE-CHAT (待删)

> 详见 A.3 表 + A.4 WS message types。
> 注:经过 2026-07-07 决策,`bot-routes.ts` 的 11 个 `/api/bots/*`、`/api/peers`、`/api/memories*` 全部归 keep (bot 管理类,非 chat)。
> chat 相关路由集中在 `binding-routes.ts` (4 routes) + `file-routes.ts` files/preview (1 route) + ws-server.ts (19 message types)。

### WS messages — chat 哪些删, 哪些保留

详见 A.4。`pipeline_progress` **保留** (L7 + L10 新增)。

---

## Section C: L5-L12 新增路由清单

| L# | Route | New endpoint | Description |
|---|---|---|---|
| L4 (Phase 4) | POST /api/v2/admin/rate-limit/override | 是 | Set rate limit override (db58df44) |
| L4 (Phase 4) | DELETE /api/v2/admin/rate-limit/override/{userId} | 是 | Clear override (db58df44) |
| L4 (Phase 4) | GET /api/v2/admin/rate-limit/inspect/{userId} | 是 | Inspect (db58df44) |
| Phase 4 L3 Fix 3 | POST /api/v2/admin/pipelines/cache/invalidate | 是 | Invalidate pipeline cache (1e288dbf) |
| L5 | GET /api/v2/admin/pipelines | 是 | List pipelines (3f83925f) |
| L5 | POST /api/v2/admin/pipelines | 是 | Create pipeline (3f83925f) |
| L5 | GET /api/v2/admin/pipelines/{id} | 是 | Get pipeline (3f83925f) |
| L5 | PATCH /api/v2/admin/pipelines/{id} | 是 | Update pipeline (3f83925f) |
| L5 | DELETE /api/v2/admin/pipelines/{id} | 是 | Delete pipeline (3f83925f) |
| L5 | POST /api/v2/admin/pipelines/{id}/trigger | 是 | Trigger pipeline (3f83925f) |
| L5 | GET /api/v2/admin/pipelines/{id}/runs | 是 | List runs (3f83925f) |
| L5 | GET /api/v2/admin/pipelines/{id}/runs/{runId} | 是 | Get run (3f83925f) |
| L5 (Plan B-2) | GET /api/v2/agents | 是 | List agents (agents-crud-routes.ts, L9 race 完善) |
| L5 (Plan B-2) | POST /api/v2/agents | 是 | Create agent |
| L5 (Plan B-2) | GET /api/v2/agents/{id} | 是 | Get agent |
| L5 (Plan B-2) | PATCH /api/v2/agents/{id} | 是 | Update agent |
| L5 (Plan B-2) | DELETE /api/v2/agents/{id} | 是 | Delete agent |
| L5 (Plan B-2) | POST /api/v2/agents/{id}/run | 是 | Run agent (RAG) |
| L5 (Plan B-2) | GET /api/v2/agents/{id}/knowledge-refs | 是 | List KB refs |
| L5 (Plan B-2) | POST /api/v2/agents/{id}/knowledge-refs | 是 | Add KB ref |
| L5 (Plan B-2) | DELETE /api/v2/agents/{id}/knowledge-refs/{refId} | 是 | Remove KB ref |
| L5 (Plan B-2) | GET /api/v2/admin/agent-run-logs | 是 | List run logs |
| L5 (Plan B-2) | GET /api/v2/admin/agent-run-logs/stats | 是 | Run log stats |
| L5 (Plan B-3) | GET /api/v2/admin/reports/{dimension} | 是 | Get reports |
| L5 (Plan D) | GET /api/v2/admin/reports/{dimension}/export | 是 | Export CSV |
| L5 (Plan C) | GET /api/v2/admin/tenants/{tenantId}/quotas | 是 | List tenant quotas |
| L5 (Plan C) | POST /api/v2/admin/tenants/{tenantId}/quotas | 是 | Create quota |
| L5 (Plan C) | PATCH /api/v2/admin/tenants/{tenantId}/quotas/{id} | 是 | Update quota |
| L5 (Plan C) | DELETE /api/v2/admin/tenants/{tenantId}/quotas/{id} | 是 | Delete quota |
| L5 (Plan F) | GET /api/v2/admin/embedding-jobs/{id} | 是 | Embedding job status |
| L5 (其他) | POST /api/v2/admin/channels/usage | 是 | Record channel usage |
| L6 | (增强) POST /api/v2/admin/pipelines/{id}/trigger | 否(原有,大改) | ?async=true 异步触发 (2b0c256d) |
| L7 | (新增 WS) pipeline_progress | 是 | WS 进度推送 (ba8af6fb) |
| L8 | (增强) POST /api/v2/admin/pipelines | 否(原有,大改) | retryPolicy 字段 (707b5f44) |
| L8 | (增强) POST /api/v2/admin/pipelines/{id}/trigger | 否(原有,大改) | 接通 L6 async (707b5f44) |
| L9 | (增强) POST /api/v2/agents | 否(原有,大改) | triggerStrategy first/all/race (73e0d0f0) |
| L10 | (增强) pipeline_progress | 否(原有,大改) | bot 触发也广播 (76ccb2c1) |
| L11 | (增强) POST /api/v2/admin/pipelines | 否(原有,大改) | diff label 变化检测 (ef271976) |
| L12 | (后端) rate-limit middleware Redis | 否 | 透明加速 (b8c11d69) |

---

## 健康度报告 (推断)

> 从 `git log` 和 `tests/` 目录推断。每个文件的状态:

| File | Lines | Last modified by L# | Tests | Status |
|---|---|---|---|---|
| pipeline-routes.ts | 410 | L8 (707b5f44) | src/api/__tests__/pipeline-events.test.ts (L7) | ✅ 健康,L5-L8 集中改动,有测试 |
| admin-cache-routes.ts | 50 | L3 Fix 3 (1e288dbf) | - | ✅ 健康,小但功能完整 |
| admin-ratelimit-routes.ts | 200+ | L4 (db58df44) | src/middleware/pipeline-rate-limit.test.ts | ✅ 健康 |
| agent-routes.ts | small | old | - | ✅ 稳定,旧模块 |
| agent-knowledge-routes.ts | small | Plan B-2 | - | ✅ 健康 |
| agent-run-logs-routes.ts | small | Phase 1 | - | ✅ 健康 |
| agent-run-routes.ts | small | Plan B-2 | - | ✅ 健康 |
| agents-crud-routes.ts | medium | L9 (73e0d0f0) | - | ✅ 健康 |
| auth-routes.ts | large | old | - | ✅ 稳定 |
| binding-routes.ts | small | old | - | ❌ 4 routes 归 delete-chat (待删) |
| bot-routes.ts | large | old | - | ✅ 11 routes 全部 keep (bot 管理类,已确认) |
| channels-routes.ts | small | old | - | ✅ 健康 |
| channel-usage-routes.ts | small | Plan E | - | ✅ 健康 |
| dashboard-routes.ts | small | old | - | ✅ 健康 |
| embedding-jobs-routes.ts | small | Plan F | - | ✅ 健康 |
| file-routes.ts | small | old | - | ⚠️ files/preview 归 delete-chat |
| generate-routes.ts | small | old | - | ✅ 健康 |
| knowledge-base-routes.ts | small | old | - | ✅ 健康 |
| knowledge-routes.ts | medium | old | - | ✅ 健康 |
| maintenance-routes.ts | small | old | - | ✅ 健康 |
| memory-routes.ts | small | old | - | ✅ 健康 |
| models-pool-routes.ts | small | old | - | ✅ 健康 |
| monitoring-routes.ts | small | old | - | ✅ 健康 |
| oauth-client-routes.ts | medium | old | - | ✅ 健康 |
| oauth-routes.ts | large | old | - | ✅ 健康 |
| ops-routes.ts | small | old | - | ✅ 健康 |
| pipeline-routes.ts | 410 | L8 | ✅ 有测试 | ✅ 核心改动,有保障 |
| project-routes.ts | small | old | - | ✅ 健康 |
| provider-routes.ts | small | old | - | ✅ 健康 |
| reports-export-routes.ts | small | Plan D | - | ✅ 健康 |
| reports-routes.ts | small | Plan B-3 | - | ✅ 健康 |
| resource-routes.ts | small | old | - | ✅ 健康 |
| rtc-routes.ts | small | old | - | ✅ 健康 |
| runtime-routes.ts | small | old | - | ✅ 健康 |
| scheduled-jobs-routes.ts | small | old | - | ✅ 健康 |
| session-routes.ts | small | old | - | ✅ 健康 |
| skill-catalog-routes.ts | small | old | - | ✅ 健康 |
| skill-dag-routes.ts | small | old | - | ✅ 健康 |
| skill-hub-routes.ts | small | old | - | ✅ 健康 |
| sync-routes.ts | small | old | - | ✅ 健康 |
| task-routes.ts | small | old | - | ✅ 健康 |
| **team-routes.ts** | 350+ | old | - | ❌ **26/27 routes 待删** (1 keep activity/events) |
| template-routes.ts | small | old | - | ✅ 健康 |
| tenant-quota-routes.ts | small | Plan C | - | ✅ 健康 |
| voice-routes.ts | small | old | - | ✅ 健康 |
| workspace-routes.ts | medium | old | - | ✅ 健康 |
| **ws-server.ts** | large | L7+L10 | - | ⚠️ 19 message types 待删,19 keep (含 pipeline_progress) |

---

## 已确认决策 (2026-07-07)

| # | 边界 | 决策 | 落地位置 |
|---|---|---|---|
| 1 | `/api/bindings/*` (4 routes) | **delete-chat** (chat group → bot 路由) | A.3, OpenAPI 已移除 |
| 2 | `/api/files/preview/{chatId}` | **delete-chat** (URL 含 chatId) | A.3, OpenAPI 已移除 |
| 3 | `/api/activity/events` | **keep** (activity log 本质,与 team 解耦) | A.1 + Section B KEEP (admin) + OpenAPI 新增 1 path entry |
| 4 | `/api/coordinator/*` (6 routes) | **delete-team** (team-routes.ts 整体待删) | A.2, OpenAPI 已无 |
| 5 | `/api/voice-identities/*` (3 routes) | **delete-team** (team-routes.ts 整体待删) | A.2, OpenAPI 已无 |
| 6 | `bot-routes.ts` 11 routes (bots/peers/memories) | **全部 keep** (bot 管理类,非 chat) | A.1, OpenAPI 保留 |
| 7 | WS message types | 19 keep + 19 delete-chat,`pipeline_progress` 保留 (L7+L10) | A.4, 不变 |

**结果 (v1.1.0 终极版)**:OpenAPI paths 从 130 → **179** (+49 path entries)。
其中 **22 个 A/B/C/D 组强制补全**:

### A 组 (Provider/Monitoring/Auth/Generate) — 8 个
| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/providers/default | provider-routes.ts | Default provider |
| POST | /api/providers/test | provider-routes.ts | Test provider config |
| GET | /api/metrics | sync-routes.ts | Metrics snapshot |
| GET | /api/stats | sync-routes.ts | Stats snapshot |
| POST | /api/auth/change-password | auth-routes.ts | Change own password |
| POST | /api/generate/image | generate-routes.ts | Generate image |
| POST | /api/generate/music | generate-routes.ts | Generate music |
| POST | /api/generate/speech | generate-routes.ts | TTS speech |

### B 组 (RTC 实时音视频) — 8 个
| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/rtc/config | rtc-routes.ts | RTC config |
| GET | /api/rtc/sessions | rtc-routes.ts | Active sessions |
| POST | /api/rtc/start | rtc-routes.ts | Start RTC voice chat |
| POST | /api/rtc/stop | rtc-routes.ts | Stop RTC voice chat |
| POST | /api/rtc/token | rtc-routes.ts | Generate/refresh token |
| POST | /api/rtc/transcript | rtc-routes.ts | Submit transcript |
| GET | /api/rtc/transcript | rtc-routes.ts | Get transcript |
| POST | /api/rtc/voice | rtc-routes.ts | Voice frame |

### C 组 (Skill Hub) — 6 个
| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/skills | skill-hub-routes.ts | List skills |
| POST | /api/skills | skill-hub-routes.ts | Create skill |
| POST | /api/skills/install-from-github | skill-hub-routes.ts | Install from GitHub |
| POST | /api/skills/refresh | skill-hub-routes.ts | Refresh registry |
| GET | /api/skills/plugins | skill-catalog-routes.ts | Plugins catalog |
| POST | /api/skills/seed | skill-catalog-routes.ts | Seed catalog |

### D 组 (Sync / Schedule) — 5 个
| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/sync | sync-routes.ts | Get sync status |
| POST | /api/sync | sync-routes.ts | Trigger sync |
| POST | /api/sync/document | sync-routes.ts | Sync a document |
| GET | /api/schedule | task-routes.ts | List scheduled jobs |
| POST | /api/schedule | task-routes.ts | Create scheduled job |

### 额外补全 (27 个,扫描发现非 chat/team)
| Method | Path | File | Description |
|---|---|---|---|
| GET | /api/v1/agent/bots | agent-routes.ts | List bots via agent API |
| POST | /api/v1/approval/submit | agent-routes.ts | Submit for approval |
| GET | /api/v1/approval/list | agent-routes.ts | List approvals |
| POST | /api/v1/approval/resolve | agent-routes.ts | Resolve approval |
| GET | /api/v2/admin/agents | agents-crud-routes.ts | List admin agents |
| POST | /api/v2/admin/agents | agents-crud-routes.ts | Create admin agent |
| PUT | /api/auth/users/{name} | auth-routes.ts | Update user (admin) |
| DELETE | /api/auth/users/{name} | auth-routes.ts | Delete user (admin) |
| GET | /api/reports/{name} | file-routes.ts | Serve HTML report |
| POST | /api/v2/admin/maintenance/refresh-mv | maintenance-routes.ts | Refresh materialized views |
| POST | /api/v1/memory/store | memory-routes.ts | Memory store |
| POST | /api/v1/memory/retrieve | memory-routes.ts | Memory retrieve |
| POST | /api/v1/memory/synthesize | memory-routes.ts | Memory synthesize |
| GET | /api/projects/roots | project-routes.ts | List project roots |
| GET | /api/projects/list | project-routes.ts | List projects |
| GET | /api/projects/read | project-routes.ts | Read project file |
| PUT | /api/providers/{name} | provider-routes.ts | Update provider |
| DELETE | /api/providers/{name} | provider-routes.ts | Delete provider |
| GET | /api/v2/admin/embedding-providers | resource-routes.ts | List embedding providers |
| POST | /api/v2/admin/embedding-providers | resource-routes.ts | Create embedding provider |
| GET | /api/v2/admin/mcp-servers | resource-routes.ts | List MCP servers |
| POST | /api/v2/admin/mcp-servers | resource-routes.ts | Create MCP server |
| GET | /api/v2/admin/runtime/stats | runtime-routes.ts | Runtime stats |
| GET | /api/v2/admin/runtime/sessions | runtime-routes.ts | Runtime sessions |
| GET | /api/sessions/all | session-routes.ts | All sessions |
| GET | /api/skills/search | skill-hub-routes.ts | Search skills |
| GET | /api/skills/registry | skill-hub-routes.ts | Skill registry |
| GET | /api/skills/catalog-content | skill-catalog-routes.ts | Catalog content |
| GET | /api/feishu/document | sync-routes.ts | Fetch Feishu doc |
| PATCH | /api/schedule/{name} | task-routes.ts | Update scheduled job |
| DELETE | /api/schedule/{name} | task-routes.ts | Delete scheduled job |
| GET | /api/costs/report | team-routes.ts | Cost report (team budget manager) |

### WS Message Types — 19 keep (写入 components.x-ws-messages)

| Direction | Type | Description |
|---|---|---|
| C→S | ping | WebSocket keepalive ping |
| S→C | connected | Initial connection response with bot roster |
| S→C | bots_updated | Bot roster update |
| S→C | state | Streaming state for in-progress message |
| S→C | complete | Final state of completed message |
| S→C | error | Generic error event |
| S→C | notice | User-visible notice |
| S→C | file | File attachment |
| S→C | sessions_list | Sessions list |
| S→C | session_adopted | Session adopted confirmation + history |
| S→C | session_history | Session message history |
| S→C | session_renamed | Session renamed |
| S→C | session_deleted | Session deleted |
| S→C | asr_started | ASR session started |
| S→C | asr_transcript | ASR partial/final transcript |
| S→C | asr_error | ASR error |
| S→C | asr_stopped | ASR session stopped |
| S→C | pong | Pong response |
| S→C | pipeline_progress | Pipeline run progress broadcast (L7+L10) |

**结果**:OpenAPI paths 从 130 → **179** (+49 path entries),新增 `components.x-ws-messages` 数组(19 entries)。
注:`bot-bindings` tag 已同步从 OpenAPI 移除,新增 `activity` tag。
**team-routes.ts**:27 → 26 delete-team (activity 转 keep)。