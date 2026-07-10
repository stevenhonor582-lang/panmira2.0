# 会话交接 — R38-C4 新路由 + memory 反查(2026-07-10)

## 当前任务
R38 Agent-Centric 迁移 C4 阶段:3.3-3.7 路由实施。3.1/3.2/3.8 是 C3 在做。

## 已完成(commit 25fb680)
- [x] 3.3 POST /api/v2/admin/agents/:id/{promote,demote}(事务 + 解绑 bots)
- [x] 3.4 POST /api/v2/admin/agents/:srcId/copy-as-template(深拷贝为新模板)
- [x] 3.5 AgentStore.createInstanceFromTemplate 末尾补克隆 agent_skill_refs / agent_knowledge_refs / agent_mcp_refs
- [x] 3.6 /api/v1/memory/{store,retrieve} 加 agentId 入参,服务端 JOIN bot_configs 反查
- [x] 3.7 /api/v2/admin/agents/:id/mcp-refs CRUD(GET/POST/DELETE)
- [x] agent_mcp_refs 表(DB + src/db/schema.ts) — 表之前实际未建,本次补建
- [x] tsc -p tsconfig.build.json 无错误
- [x] pm2 reload panmira 在线
- [x] curl 端到端验证 18 项全部 PASS

## curl 验证清单(2026-07-10 现场)
| T# | 场景 | 结果 |
|----|------|------|
| T1 | POST /agents/墨言/promote | 200, is_template=true, channel_ids=[], model_id=NULL |
| T2 | bot_configs.agent_id 被清空 | ✓ unbound_bots=[] |
| T3 | POST /agents/墨言/demote | 200, is_template=false, working_dir=/workspace/agents/myqwa-2210rq |
| T4-T5 | POST /agents/守静/copy-as-template | 201, 新模板 + 克隆 agent_knowledge_refs |
| T6 | 不存在 srcId → 404 | ✓ agent_not_found |
| T7-T11 | mcp-refs GET/POST/DELETE | 全部 200/201, 已清理 |
| T12-T15 | memory {retrieve,store} agentId | 反查 bot_count=1, resolved_bot_id 正确 |
| T16-T17 | instantiate from-template | 新实例 KB ref 克隆成功(topK=3, min_score=0.1) |

## 关键决策 / 约束
- **agent_mcp_refs 表**:C1 阶段说"已建",但 DB 实际未建。补建 SQL 已跑(`\d agent_mcp_refs` 可见)。
- **promote 事务**:用 BEGIN/COMMIT + FOR UPDATE,先 SELECT 锁行,后 UPDATE bots → UPDATE agent。
- **demote 重名**:若有同名实例已存在,demote 直接 400 name_taken(避免破坏 unique 索引)。
- **memory agentId 兼容**:保留 botId 旧入参,加 agentId 新入参;agentId 模式下 post-filter by bot_ids。
- **copy-as-template INSERT**:用纯 INSERT 而非 INSERT...SELECT FROM subquery(原写法 PG 报 syntax error at FROM)。

## 用户偏好 / 风格
- 严守 R38 规范,不改 llm-client(C3 范畴)
- 严守不动前端(阶段 4 才动)
- 严守不碰 R36/R37/C1/C2/C3 commit

## 重要文件 / 路径
- 修改:src/api/routes/agents-crud-routes.ts (+291 行,新增 promote/demote/copy-as-template/mcp-refs)
- 修改:src/api/routes/memory-routes.ts (+49 行,agentId 反查)
- 修改:src/db/agent-store.ts (+24 行,createInstanceFromTemplate 末尾克隆 refs)
- 修改:src/db/schema.ts (+27 行,agentMcpRefs 表)
- 新建:.claude/R38-MIGRATION-SPEC.md(规划阶段,未改)
- 新建:.claude/handoff-2026-07-10-r38-c4-routes-done.md(本文件)
- 待跟进:前端阶段 4(tab-memory 跳链 agentId、templates 加 promote 按钮)

## 下次会话优先
- 阶段 4 前端:tab-memory.tsx 跳链 botId → agentId
- 阶段 4 前端:templates 页面加 promote/demote 按钮
- 阶段 5 端到端验证:墨言回归测试(改 defaultModel 后实际跑新 provider)
- 阶段 1 SQL 补建:bot_secrets / bot_budgets / activity_events 加 agent_id 列(spec §2.3)
- 阶段 2 SQL 回填:memories.agent_id(本次未做,需要时跑 bc.agent_id 回填 SQL)
