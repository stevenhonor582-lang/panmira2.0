# R49 数据字典

> **生成时间**: 2026-07-10
> **基础**: panmira-N1 HEAD=801bdc5 + R49-A/B/C 4 commit
> **范围**: public schema 全部 87 对象(82 BASE TABLE + 5 VIEW)
> **单位**: 行数 = `pg_stat_user_tables.n_live_tup` 估值,大小 = `pg_total_relation_size` 含索引

## 0. 摘要

| 维度 | 数量 |
|------|------|
| 公开表 BASE TABLE | 82 |
| 视图 VIEW | 5 |
| 总对象 | 87 |
| HNSW 向量索引 | 4 (memories / document_chunks / semantic_assets / semantic_versions) |
| GIN 倒排索引 | 1 (document_chunks.search_tsv) |
| 物化视图 | 1 (mv_usage_reports_daily) |
| 触发器 | 7+ (audit / updated_at / l3_self_iterate) |

**R49-A/B/C 改后状态**:
- 删除 6 张残留表(`bot_skill_bindings` / `templates` / `memories_backup_20260705` / `_backup_20260608_documents` / `_backup_20260608_folders` / `_journal`)
- 新增 4 张语义层表(`semantic_*`)
- 新增 2 个 HNSW 向量索引(memories / document_chunks)

---

## 1. 租户 / 用户 / 认证(8 表 + 1 视图)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 租户 | `tenants` | 1 | 32 kB | 多租户根,所有数据挂 tenant_id 下 |
| 租户配额 | `tenant_quotas` | 0 | 24 kB | 每租户资源上限(API 调用 / 存储 / seats) |
| 用户 | `users` | 6 | 192 kB | 真人员工,SSO/OAuth 主体 |
| 团队 | `teams` | 0 | 16 kB | 部门/小组维度,挂在 tenant 下 |
| 用户-团队 | `user_teams` | 0 | 0 bytes | M:N 中间表 |
| 组关系 | `group_memberships` | 0 | 24 kB | OAuth group 同步 |
| 真人-Agent 绑定 | `user_agent_bindings` | 1 | 80 kB | R20 核心表,人员使用/负责哪个 agent |
| 扩展资料 | `people_profile_extended` | 5 | 32 kB | 真人详细档案(从 users 拆出) |
| 真人聚合视图 | `people` (VIEW) | — | — | users + extended 聚合 |
| OAuth 客户端 | `oauth_clients` | 7 | 32 kB | OAuth 2.0 客户端注册 |
| OAuth 授权码 | `oauth_authorization_codes` | 0 | 16 kB | /authorize 一次性码 |
| OAuth 设备码 | `oauth_device_codes` | 0 | 16 kB | Device Flow 设备码 |
| OAuth 访问令牌 | `oauth_access_tokens` | 77 | 64 kB | Bearer token |
| OAuth 刷新令牌 | `oauth_refresh_tokens` | 79 | 56 kB | refresh_token 撤销链 |
| OAuth 已授权 | `oauth_authorized` | 4 | 48 kB | 用户对客户端的同意记录 |
| 外部 OAuth | `external_oauth_credentials` | 0 | 16 kB | 接 GitHub / Google 等第三方凭据 |
| 声纹 | `voice_identities` | 0 | 16 kB | 语音身份识别 |

## 2. Agent / 数字员工(10 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| Agent 模板 | `agent_templates` | 2 | 32 kB | R42 拆出,模板可复用 |
| Agent 实例 | `agent_instances` | 8 | 120 kB | R42 拆出,实际运行的数字员工 |
| Agent 流水线 | `agent_pipelines` | 6 | 184 kB | Agent 内部 DAG 编排 |
| Agent 运行日志 | `agent_run_logs` | 0 | 16 kB | 单次执行的 trace |
| Agent 消息 | `agent_messages` | 0 | 16 kB | Agent 之间通信 |
| Agent-Skill 引用 | `agent_skill_refs` | 0 | 16 kB | R42 新表,多对多 |
| Agent-KB 引用 | `agent_knowledge_refs` | 3 | 32 kB | R42 新表,Agent 挂载 KB |
| Agent-MCP 引用 | `agent_mcp_refs` | 0 | 64 kB | R42 新表,Agent 调用 MCP |
| Agent 团队授权 | `agent_team_auth` | 0 | 0 bytes | Agent 访问团队的授权记录 |
| 路由绑定 | `routing_bindings` | 0 | 32 kB | 消息→Agent 路由规则 |

## 3. Bot / 老 bot 系统(7 表,含 1 废表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| Bot 配置 | `bot_configs` | 5 | 152 kB | 道家 5 bot 实际配置 |
| Bot 密钥 | `bot_secrets` | 15 | 64 kB | API key / 加密凭据 |
| Bot 预算 | `bot_budgets` | 1 | 40 kB | 单 bot 用量上限 |
| 预算历史 | `budget_history` | 2 | 56 kB | 预算变更时间线 |
| Bot-Agent 历史 | `bot_agent_history` | 6 | 48 kB | **已废,占位保留**(R34 bot→agent 迁移完成后未清) |
| 发现的群 | `discovered_groups` | 0 | 16 kB | 飞书/钉钉自动发现的群 |
| 群内机器人 | `discovered_group_bots` | 0 | 16 kB | 群内 Bot 名单 |
| 线索绑定 | `lead_bindings` | 0 | 8 kB | Bot 抓的 CRM 线索 |

## 4. 记忆 / 记忆治理(8 表 + 1 视图)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 记忆主表 | `memories` | 4207 | 69 MB | 三层记忆主体,含 vector(1024) embedding |
| 记忆评估 | `memories_eval` | 6 | 32 kB | R48 P1,人工/自动打分 |
| 记忆设置 | `memory_settings` | 6 | 32 kB | 每用户/agent 记忆策略 |
| 提取记忆 | `extracted_memories` | 0 | 40 kB | 从对话抽取的原始记忆 |
| 提取审计 | `extraction_audit_log` | 0 | 24 kB | 提取过程追溯 |
| 嵌入任务 | `embedding_jobs` | 1 | 32 kB | 待补 embedding 队列 |
| 嵌入 Provider | `embedding_providers` | 1 | 32 kB | OpenAI / 本地模型配置 |
| RAG 查询日志 | `rag_query_log` | 499 | 328 kB | RAG 检索命中/打分明细 |
| 记忆+提取聚合 | `v_memory_with_extraction` (VIEW) | — | — | 联表查询便捷视图 |
| RAG P50 分数 | `v_rag_top_score_p50` (VIEW) | — | — | P50 监控 |

## 5. 知识库 / 文档(7 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 文档 | `documents` | 2438 | 38 MB | 知识库主体,md/pdf/docx |
| 文档分块 | `document_chunks` | 20 | 48 MB | vector(1024) 向量主导 |
| 文档映射 | `document_mappings` | 0 | 16 kB | 跨库/跨系统引用 |
| 目录 | `folders` | 98 | 192 kB | 知识库目录树 |
| 目录映射 | `folder_mappings` | 0 | 16 kB | 跨库目录引用 |
| 知识库 | `knowledge_bases` | 1 | 32 kB | KB 集合(R49-B 即将挂语义层) |
| 场景包 | `scene_packs` | 3 | 48 kB | 预设业务场景工具包 |
| 场景专家 | `scene_pack_experts` | 12 | 64 kB | scene_pack 内置专家 |

## 6. 会话 / 消息(5 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 会话 | `sessions` | 45 | 96 kB | SDK 主会话 |
| 会话消息 | `session_messages` | 1116 | 1928 kB | 单条消息 |
| 会话链接 | `session_links` | 0 | 24 kB | 会话与外部资源关联 |
| 聊天会话 | `chat_sessions` | 10 | 88 kB | 飞书 chatId 维度会话 |
| 澄清会话 | `clarification_sessions` | 1 | 112 kB | 用户澄清问题中间态 |
| 活动事件 | `activity_events` | 7871 | 5480 kB | 全局事件流(高频写) |

## 7. 资源 / MCP / Skill(6 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 技能 | `skills` | 0 | 24 kB | 技能定义 |
| 技能 DAG | `skill_dags` | 0 | 16 kB | 技能内子步骤 DAG |
| 技能使用 | `skill_usage` | 0 | 8 kB | 技能调用频次/成功率 |
| MCP 服务 | `mcp_servers` | 6 | 32 kB | MCP 注册(GitHub/MiniMax/SSH×4) |
| Provider 配置 | `provider_configs` | 5 | 48 kB | LLM provider 凭据 |
| 端点视图 | `endpoints` (VIEW) | — | — | API endpoint 注册表 |
| 模型池视图 | `model_pool` (VIEW) | — | — | provider + 模型聚合 |

## 8. 调度 / 编排 / Pipeline(7 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| Pipeline 运行 | `pipeline_runs` | 22 | 240 kB | DAG 一次执行 |
| 异步任务 | `async_tasks` | 0 | 16 kB | 通用异步队列 |
| 周期任务 | `recurring_tasks` | 0 | 16 kB | cron 风格 |
| 调度任务 | `scheduled_tasks` | 0 | 16 kB | 一次性延迟任务 |
| 调度作业 | `scheduled_jobs` | 1 | 32 kB | BullMQ 持久化 |
| 任务 | `tasks` | 0 | 72 kB | 通用 task 实体 |
| 协调器配置 | `coordinator_configs` | 0 | 24 kB | 多 agent 协调策略 |

## 9. 日志 / 审计 / 可观测(9 表 + 1 物化视图)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 审计日志 | `audit_logs` | 5 | 32 kB | 关键操作审计 |
| 端点健康 | `endpoint_health` | 0 | 24 kB | API 健康检查最近状态 |
| 熔断器状态 | `circuit_breaker_states` | 1 | 48 kB | 外部依赖熔断 |
| 速率限制状态 | `rate_limit_state` | 0 | 8 kB | R 限速持久化(防 reload 绕过) |
| NextCRM 同步 | `nextcrm_sync_outbox` | 49 | 184 kB | 外部 CRM 同步出站 |
| 同步配置 | `sync_config` | 0 | 16 kB | 外部系统同步策略 |
| 任务指标 | `task_metrics` | 1 | 80 kB | 任务执行指标 |
| 团队指标 | `team_metrics` | 4 | 48 kB | 团队维度指标 |
| 用量报表 | `usage_reports` | 14 | 80 kB | 日维度用量明细 |
| 日用量物化视图 | `mv_usage_reports_daily` | — | — | 当日用量预聚合 |

## 10. 语义层(R49-B 新增 4 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 语义资产 | `semantic_assets` | 0 | 80 kB | **R49-B 新**,KB/doc/memory 的语义索引层 |
| 语义版本 | `semantic_versions` | 0 | 48 kB | **R49-B 新**,同一 asset 多版本 |
| 语义关系 | `semantic_relations` | 0 | 48 kB | **R49-B 新**,关联/依赖/相似/冲突 |
| 注入规则 | `semantic_injection_rules` | 0 | 32 kB | **R49-B 新**,JSONLogic 决定何时注入 |

> 当前 4 表都为空,等 R49 块 C/D 阶段 wire(同步 worker / API / 调度)。详见 `.claude/R48-UPGRADE-IMPLEMENTATION-SPEC.md` §3.1。

## 11. 系统 / Migrations(1 表)

| 中文 | 英文表名 | 行数 | 大小 | 用途 |
|------|----------|------|------|------|
| 迁移日志 | `_migration_log` | 24 | 16 kB | `migrations/*.sql` 执行历史 |

---

## 附录 A:索引清单(关键性能索引)

| 表 | 索引名 | 类型 | 列 | 备注 |
|----|--------|------|------|------|
| memories | idx_memories_embedding_hnsw | **HNSW** | embedding | **R49-C 新增**,13.6x 提速 |
| document_chunks | idx_document_chunks_embedding_hnsw | **HNSW** | embedding | **R49-C 新增**,行为一致 |
| document_chunks | idx_chunks_tsv | GIN | search_tsv | 全文搜索 |
| memories | idx_memories_bot_subject_unique | UNIQUE btree | (bot_id, subject_normalized) | 业务唯一性 |
| memories | idx_memories_hit_count | btree DESC | hit_count WHERE invalidated_at IS NULL | 热门记忆 |
| semantic_assets | idx_sa_embedding | **HNSW** | embedding | R48 同步 worker 用 |
| semantic_versions | idx_sv_embedding | **HNSW** | embedding | R48 同步 worker 用 |

## 附录 B:R49-A 删表(已从字典移除)

- ~~`bot_skill_bindings`~~(22 行) → 已被 `agent_skill_refs` 替代
- ~~`templates`~~(4 行) → 已被 `agent_templates` 覆盖
- ~~`memories_backup_20260705`~~(4174 行/32 MB) → 迁移完成冗余
- ~~`_backup_20260608_documents`~~(424 行) → 6/8 schema 快照
- ~~`_backup_20260608_folders`~~(55 行) → 6/8 schema 快照
- ~~`_journal`~~(2 行) → 手工迁移日志

## 附录 C:已知"老"或"待清"表(非 R49 范围)

- `bot_agent_history`(6 行) — R34 bot→agent 迁移完成后的占位历史,R49 不动
- `rate_limit_state`(0 行) — 实时累计表,空属正常
- `_migration_log`(24 行) — 系统级,不动

## 附录 D:表数量变更时间线

| 阶段 | 表数 | 变化 |
|------|------|------|
| 2026-07-10 前(基线) | 89 | — |
| R49-A 删除 6 残留 | 83 | -6 |
| R49-B 语义层 4 表 | 87 | +4 |
| R49-C 加索引(不动表数) | 87 | 0 |
| **当前(2026-07-10)** | **87** | **+4 -6 = -2** |
