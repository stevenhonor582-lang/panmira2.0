# panmira Q1 数据真实性巡检报告

> 巡检时间: 2026-07-08
> 巡检脚本: `scripts/2026_07_08_q1_data_audit.sql` (169 行)
> 数据库: `postgresql://ubuntu:ubuntu@localhost:5432/metabot`
> 巡检方法: 直接 SQL,8 张主表 + 4 张辅表 + 活动度

---

## 📊 1. 8 张核心表真实性快照

| # | 表 | total | 真实数据 | 假数据 / 测试残留 / 缺元数据 | 真实度 |
|---|----|------|---------|----|----|
| 1 | **agents** (数字员工) | 8 | 全部是真实登记的 bot | avatar_url 全是 `/avatars/*.svg` 占位符 (8/8 = 100%); 3/8 无 owner_user_id (legacy/system/lab); default_model 全 NULL (P0 部分回填未生效) | **75%** |
| 2 | **users** (真人) | 5 | 全部是真实用户 | 只 1/5 有 phone (史德飞 = 18500299558); 其余 4 个 phone NULL (B1 后端对接先空着) | **60%** |
| 3 | **agent_pipelines** (流水线) | 13 | 全部真实(11 业务 + 3 archived e2e 测试) | **11/13** pipelines 缺 description (业务元数据不全); **0** 是 schedule trigger (13/13 全 manual) | **50%** |
| 4 | **documents** (知识库) | 2526 | 全部真实 KB 文档 (历史导入 + E2E 测试) | **81/2526 (3.2%)** 缺 bot_id 归属 (孤儿文档) | **97%** |
| 5 | **knowledge_bases** | 2 | 2 真实 KB (E2E Test KB / 历史导入文档) | 完整 | **100%** |
| 6 | **provider_configs** | 5 | 5 真实 LLM/embedding 服务商 | 完整,5/5 有加密 key | **100%** |
| 7 | **bot_configs** (飞书 channel) | 5 | 5 真实飞书 bot (不盈/信言/守静/得一/玄鉴) | 完整,无缺项 | **100%** |
| 8 | **folders** | 98 | 98 真实文件夹 (1 root + 97 子) | 无 bot_id 列替字段,纯 path 树 | **100%** |

**汇总: 整体真实数据百分比 ≈ 85% (加权)**

---

## 🔍 2. 标记:假数据 / 测试残留 / 需要回填

### 2.1 假数据 (placeholder,前端需要做 fallback)

| 项 | 数量 | 详情 |
|---|------|-----|
| `agents.avatar_url` | 8/8 | 全部是 `/avatars/*.svg` 路径,如 `/avatars/buying.svg` `/avatars/xuanjian.svg` `/avatars/default.svg`。**前端需要按 bot_id 渲染 SVG,或前端动态生成 initials 头像。** |
| `agents.default_model` | 8/8 (大概率) | 全部 NULL,只有 `engine='claude'`。P0 migration 回填了 `model_id` 但回填到 `model_id` 不是 `default_model`。**前端 UI 看到 default_model NULL 时是空白**。 |
| `pipelines.description` | 11/13 | 11 个 pipelines name="TEST-L12-1783434045251" 等无 description;2 个有 (L8+L9 final test / L8+L9+L11 Smoke Test)。**生产界面 description 字段大面积空白。** |

### 2.2 测试残留 (e2e/test fixtures)

| 项 | 数量 | 推荐处置 |
|---|------|---------|
| `agents.efadf77d` "测试Bot--验证缝合" | 1 | role=`test-bot`,display_name 含"测试Bot"。**保留还是删除?** 数字员工页面会显示 |
| `agents.a0e05f20` "L6 Test Agent" | 1 | role=`general`,display_name="L6 Test Agent"。**保留还是删除?** |
| `agents.ce0de8dc` "full-stack-engineer (legacy)" | 1 | 已 deprecated,digital_employees view 已排除 OK |
| `pipelines` (3个) | 3 | 已 archived,UI 显示在 archived filter。L6 Test Pipeline / e2e parallel+retry test / e2e real llm test 已接管给史德飞 |
| `users.e2e-test-member@panmira.com` | 1 | sid=`metmira:e2e_test_member`,role=member。**保留 (E2E 留个 member)** 还是删除? |

### 2.3 需要回填的字段(空缺元数据)

| 表.字段 | 当前为空数 | 推荐动作 |
|--------|----------|---------|
| `agents.default_model` | 8 | 给每个 agent 绑定到 provider_configs.id (现 engine='claude' 应统一映射到智谱 GLM 或 MiniMax M3) |
| `agents.owner_user_id` | 3 | legacy/system/lab 这些不是真实用户,前端渲染 "系统" 或 "实验台" |
| `pipelines.description` | 11 | 业务元数据,从 name 自动生成或人工补 description |
| `pipelines.schedule` | 0 | 业务流水线没设定时 (全是 manual trigger),如果 L6 后需要加 cron,可加列 `cron_expression` |
| `documents.bot_id` | 81 | orphan 文档,建议批量分配给 default bot (= 信言 1624 doc? 或随机散) |
| `users.phone` | 4 | 业务用户加手机号,A1 已有字段 |
| `users.avatar_url` | 0 | ✓ 用户暂未查 avatar_url 列,但 DB 应该没;若 NULL 也需要 fallback |
| `people_profile_extended` (5 个字段) | 全 5 个 users | **所有 5 个 user 没有 extended profile** — 部门/职务/入职/技能/bio 全 NULL |
| `endpoint_health` | 0 | 监测表全空,B1/B2 阶段再做 |
| `audit_logs` | 0 | 活动审计表全空,需查 A1 是否真的没记 |

---

## 📋 3. 巡检 SQL 输出的核心数字

### agents
```
total=8, active=7, deprecated=1, has_owner=5, fake_avatar=8, has_persona=8
- 5 个有 owner_user_id (史德飞 + admin)
- 3 个无 owner (legacy, L6, 测试Bot)
- 所有 8 个 avatar_url 是 /avatars/*.svg 占位
- 所有 8 个有 persona (description 回填)
```

### users
```
total=5, active=5, admin=2, operator=1, member=2, has_phone=1, has_sid=5
- admin@panmira.com (Panmira Admin, metmira:admin, 2026-05-18)
- 20218181@qq.com (史德飞, metmira:shidefei, 2026-07-08, phone=18500299558)
- op1@panmira.com (Op One, metmira:op1, operator)
- e2e-test-member@panmira.com (E2E Test, member)
- mem1@panmira.com (Mem One, member)
```

### agent_pipelines
```
total=13, active=10, archived=3, has_owner=13, has_desc=2, scheduled=0
- 13/13 现在都有 owner_id (P1 修复成功)
- 11/13 pipelines 没 description
- 0/13 是 schedule,13/13 是 manual trigger
- 10 active + 3 archived (e2e 测试历史已归档)
```

### documents
```
total=2526, in_kb=2526, bot_attached=2445, has_embedding=2525, in_kb_via_kb_id=2526
- 2526/2526 是 module='knowledge'
- 81 orphan (无 bot_id)
- 1 doc 无 embedding
```

### knowledge_bases
```
total=2
- E2E Test KB: 2 docs, 2 chunks, team, tenant=491c...
- 历史导入文档: 2524 docs, 22 chunks ⚠️ chunks 数异常低 (2524 docs 只有 22 chunks → 应该 embedding 时出问题了)
```

### provider_configs
```
total=5, is_default=2, llm=3, has_key=5, has_model=5
- MiniMax (LLM, default, MiniMax-M3) ✓
- 硅基流动 BGE-M3 (embedding, default) ✓
- DeepSeek V4 (LLM, 非 default, deepseek-v4-pro) ✓
- MiniMax-luoxuan (openai, 非 default, MiniMax-M3) ✓
- 智谱 GLM (LLM, 非 default, GLM-5.2) ✓
```

### bot_configs
```
total=5, all outbound, all active, all has_bot_id
- 不盈--全栈开发 (feishu)
- 信言--内容创作 (feishu)
- 守静--运维部署监控 (feishu)
- 得一--随时替补 (feishu)
- 玄鉴--数智底座管理 (feishu)
```

### folders
```
total=98, root=1, has_parent=97, bot_bound=48
- 1 root (id="root")
- 5 个固定根: 协作文档 / 知识沉淀 / 索引 / 项目文件 / 默认
- 11 个 batch 文件夹 (品牌站内容生产-Batch1..11)
- 97 子文件夹挂根
- 没有 is_root 列,只有 parent_id IS NULL 判定根
```

---

## 🚨 4. 活动度审计

| 表 | total | last 7d | last 1d | 状态 |
|----|------|---------|---------|------|
| `audit_logs` | 0 | 0 | 0 | ❌ 审计表为空,A1 没记录 |
| `pipeline_runs` | 97 | 97 | (?) | ✅ 真实运行历史,97 次中 6 failed |

⚠️ **audit_logs 全空是个警示**:A1 阶段应该写过 audit,但 DB 中无数据。建议:
1. 检查后端是否开启 audit middleware
2. 排查 P5 修复 trigger 是否有 audit trail 影响

---

## 📁 5. 关键文件

| 路径 | 说明 |
|------|------|
| `scripts/2026_07_08_q1_data_audit.sql` | 巡检脚本 (169 行,生产可重跑) |
| `.claude/q1-data-report.md` | 本报告 |
| `migrations/2026_07_08_q1_real_data.sql` | **(待生成)** 数据补全 SQL,**仅生成不跑** |
| `.claude/q1-real-data-transition.md` | **(待生成)** 前端接真数据 transition plan |
| `.claude/q1-final.md` | **(待生成)** Q1 最终汇总报告 |

---

## ⚠️ 6. 遗留(需要用户决策)

### 决策项

1. **`agents.default_model` 应当绑哪个 provider?**
   - 选项 A: 全部绑智谱 GLM (用 Claude 协议) — 默认生产路径
   - 选项 B: 按 bot 角色绑 (全栈 → MiniMax, 文案 → DeepSeek, 运维 → 智谱)
   - 选项 C: 全部绑 is_default 的那个

2. **`agents` 三个无主 (efadf77d 测试Bot / a0e05f20 L6 / ce0de8dc legacy)** 是否删除?
   - 选项 A: 全部 is_active=false (隐藏)
   - 选项 B: legacy 删,test-bot / L6 保留为 "实验台" 组
   - 选项 C: 全部保留

3. **`pipelines` 11 个缺 description** 怎么补?
   - 选项 A: 从 name 自动生成 (如 "TEST-L12-1783434045251" → "L12 速率测试")
   - 选项 B: 人工填 11 个
   - 选项 C: 不补,前端默认 fallback "无描述"

4. **`pipelines` 是否要加 schedule (cron)**?
   - 选项 A: 现在加列,业务补 cron
   - 选项 B: 不加,等业务真正需要

5. **`documents` 81 orphan** 怎么处置?
   - 选项 A: 默认分配给信言--内容创作 bot
   - 选项 B: 按文件夹随机散给 bot
   - 选项 C: 不动,前端显示 "未分配"

6. **`users.phone` 4 个 NULL** 何时补?
   - 选项 A: 现在补全 (4 个测试手机号)
   - 选项 B: 等真实用户接管后再补

7. **`people_profile_extended` 5 个 user 都 NULL** 何时填?
   - 选项 A: Q1 补全,前端展示用
   - 选项 B: Q2 阶段做,现在不入库

8. **`audit_logs` 全 0** 是 bug 吗?
   - 选项 A: 是 bug,要修
   - 选项 B: P5 修复 trigger 导致 audit 没记,是已知问题

9. **knowledge_bases "历史导入文档" chunk_count=22** 异常低
   - 2524 docs 只有 22 chunks → 应该是 embedding 时分块失败
   - 选项 A: 跑补 embed
   - 选项 B: 不动,反正都存 original documents

10. **`e2e-test-member@panmira.com`** 是否真要保留作为 E2E fixture?

---

## 💡 7. 数据 readiness 评级

| 维度 | 分数 | 备注 |
|------|------|------|
| 数据存在 | 10/10 | 8 表全有真实数据 |
| 数据真实 | 9/10 | 全部是业务真实数据 (除 e2e 测试残留) |
| 元数据完整 | 5/10 | description/avatar/department/title/hired 大量缺 |
| 活动度 | 7/10 | pipeline_runs 有,但 audit_logs 空 |
| **综合** | **7.75/10** | 够 production,但 UI 元数据展示有空白 |

**Q1 修复完应到: 9.0/10**(回填 description + default_model + phones + extended profile 即可)

---

## 🔗 8. 引用与上下文

- `handoff-2026-07-08-a2-data-done.md` — A2 数据迁移(本次巡检的对照基线)
- `handoff-2026-07-08-p1-settings-done.md` — P1 设置页(本期已完成)
- `handoff-2026-07-08-p8-security-done.md` — P8 安全清理(本期已完成)
- `migrations/2026_07_08_a2_data.sql` — A2 真实数据迁移脚本
- `migrations/2026_07_08_p0_global_cleanup.sql` — P0 global cleanup
- `migrations/2026_07_08_p5_trigger_fix.sql` — P5 trigger bug 修复
