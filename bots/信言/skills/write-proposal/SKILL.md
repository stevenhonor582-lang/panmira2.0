---
name: write-proposal
version: 1.0.0
bot_id: xin-yan
layer: 2
status: stable

description: |
  Use when: 用户 @信言 说"写方案/撰写方案/出个方案/整理成方案"，且已完成 P1-1 Clarification Engine 反问（topic/topic_category/audience/length/tone 已收齐）
  Do not use when: 写代码（升级到 bu-ying/code-review）、知识查询（升级到 xuan-jian/knowledge-rag-qa）、营销文案（write-copy 未实现，提示用户）、合同条款（write-contract 未实现，提示用户）

requires:
  mcp:
    - feishu
  scripts:
    - scripts/word-counter.py
    - scripts/toc-generator.py
    - scripts/outline-builder.py
    - scripts/section-filler.py
    - scripts/quality-checker.py
    - scripts/feishu-publisher.py
  references:
    - references/proposal-template.md
    - references/product-proposal.md
    - references/tech-proposal.md
    - references/business-proposal.md
    - references/marketing-proposal.md
    - references/audience-style-guide.md
    - references/quality-checklist.md

resources:
  timeout_ms: 300000
  max_memory_mb: 384
  max_concurrent: 3

tags:
  - content-generation
  - proposal
  - document
  - feishu-publish
---

# Write Proposal

> 自动化方案撰写：模板选择 + 大纲生成 + LLM 填充 + 质量自检 + 飞书发布
> 所属 Bot：信言 (xin-yan) | Layer 2 | v1.0.0
> P1-1 Clarification Engine 的 complementary skill（澄清通过后实际生成）

## 1. 触发条件

### 1.1 触发场景

- 用户 @信言 说"写方案 / 撰写方案 / 出个方案 / 出方案 / 整理成方案"
- Clarification Engine 已收齐必填字段：`topic` / `topic_category` / `audience` / `length`
- 用户在话题中粘贴了素材 + "整理成方案"

### 1.2 不触发场景

- 写代码 / 评审代码（升级到 bu-ying/code-review）
- 知识查询 / RAG（升级到 xuan-jian/knowledge-rag-qa）
- 营销文案（write-copy skill 未实现，提示用户"该 skill 在路线图 v1.1"）
- 合同 / 法务条款（write-contract skill 未实现，提示用户"需法务介入"）
- 用户只问"方案应该怎么写"（直接 LLM 对话，不触发 skill）

## 2. 核心流程

```
用户消息
  ↓
[Clarification Engine] 收齐 topic/topic_category/audience/length/tone/key_points
  ↓
Step 1: 模板选择（根据 topic_category）
  ├─ 产品介绍   → references/product-proposal.md
  ├─ 技术方案   → references/tech-proposal.md
  ├─ 商业计划   → references/business-proposal.md
  ├─ 营销方案   → references/marketing-proposal.md
  └─ 内部提案   → references/proposal-template.md（通用）
  ↓
Step 2: scripts/outline-builder.py
  ├─ 读取模板大纲
  ├─ 根据 audience + length 调整章节深度
  └─ 输出: outline (5-8 节点)
  ↓
Step 3: AI 填充每节（section-filler.py 仅提供结构框架）
  ├─ 对 outline 每节生成初稿
  ├─ 读取 references/audience-style-guide.md 调整语气
  ├─ 用户 key_points 必须全部覆盖
  └─ 输出: draft (Markdown)
  ↓
Step 4: scripts/quality-checker.py
  ├─ 读取 references/quality-checklist.md
  ├─ 检查: 标题层级 / 字数偏差 / 关键词覆盖 / 禁用语 / 必含章节
  └─ 输出: quality_report { passed, score, issues[] }
  ↓
Step 5: 修正循环（最多 2 轮）
  ├─ quality_report 失败 → AI 修正 → 回到 Step 4
  └─ 2 轮后仍失败 → 标记为"草稿"交付，附质量警告
  ↓
Step 6: scripts/feishu-publisher.py
  ├─ 创建飞书文档（mock：生成 mock URL）
  ├─ 上传 Markdown 全文
  └─ 输出: doc_url
  ↓
Step 7: 写审计日志
  └─ runs/<YYYY-MM-DD>/proposal-<id>/exec.log + state/proposal-<id>.json
  ↓
Step 8: 飞书卡片回复
  ├─ 卡片: 标题 + 摘要 + 飞书文档链接
  └─ 附件: Markdown 全文
```

## 3. 边界规则

| # | 规则 | 触发后行为 |
|---|------|-----------|
| 1 | 不写产品真实性 | 必须用户提供 key_points 素材，AI 不编造数据 |
| 2 | 不写法律/财务条款 | 提示用户"合同/财务建议升级到法务/财务" |
| 3 | 不抄袭 | 必须原创结构，可借鉴通用框架但不复用其他公司文案 |
| 4 | 字数偏差 > 30% | 重新生成大纲（Step 2 重跑） |
| 5 | 禁用语出现 | 强制修正（"赋能/抓手/闭环/链路/差不多/先这样"） |
| 6 | 用户要求写营销文案 | 提示"write-copy skill 未实现，请直接联系内容团队" |
| 7 | 用户要求写合同 | 提示"write-contract skill 未实现，请联系法务" |
| 8 | key_points 为空 | 拒绝生成，提示"请提供至少 1 条核心要点" |
| 9 | 必含章节缺失 | 视为质量失败，进修正循环 |

## 4. 文件读取时机

| 步骤 | 读取文件 | 用途 |
|------|---------|------|
| Step 1 模板选择 | `references/<topic_category>-proposal.md` | 加载模板大纲 + 必含章节 |
| Step 3 AI 填充 | `references/audience-style-guide.md` | 调整语气适配受众 |
| Step 4 自检 | `references/quality-checklist.md` | 应用 5 大类自检项 |
| Step 3 AI 填充 | `references/<topic_category>-proposal.md` | 读取章节写作要点 |

## 5. 脚本调用时机

| 步骤 | 命令 | 输入 | 输出 |
|------|------|------|------|
| Step 2 | `scripts/outline-builder.py <json>` | topic/topic_category/audience/length | JSON: outline[] |
| Step 3 | `scripts/section-filler.py <outline.json>` | outline + key_points | JSON: draft_skeleton{} |
| Step 4 | `scripts/quality-checker.py <body.md> <target_length>` | body + target | JSON: quality_report |
| Step 6 | `scripts/feishu-publisher.py <body.md> <title>` | body + title | JSON: { doc_url, mock } |
| 辅助 | `scripts/word-counter.py <body.md>` | body | integer: word_count |
| 辅助 | `scripts/toc-generator.py <body.md>` | body | string: TOC |

### 5.1 脚本返回约定

- 成功：stdout 输出 JSON / Markdown，exit code = 0
- 失败：stderr 输出错误信息，exit code ≠ 0
- feishu-publisher.py 默认 mock 模式：返回 `https://example.feishu.cn/doc/mock-<hash>` 不调真实 API

## 6. 验收标准

| # | 指标 | 目标 | 测量方法 |
|---|------|------|---------|
| 1 | 字数偏差 | < 15% | 50 条样本（target vs actual） |
| 2 | 必含章节完整率 | 100% | 自动化（quality-checker） |
| 3 | 禁用语出现率 | 0% | 自动化（quality-checker） |
| 4 | 飞书发布成功率 | ≥ 99% | 月度统计 |
| 5 | 一次过审率 | ≥ 80% | 50 条样本（一次 quality-checker passed） |
| 6 | 端到端时间 (P50) | < 120s | 计时器 |
| 7 | 用户 key_points 覆盖率 | 100% | 自动化（每条 key_point 在 body 出现 ≥ 1 次） |

## 7. 失败处理

| 失败场景 | 处理 |
|---------|------|
| 模板文件缺失 | 退回 references/proposal-template.md（通用模板兜底） |
| quality-checker 2 轮后仍失败 | 标记"草稿"交付，卡片附 quality_report |
| 飞书 API 失败 | 重试 1 次，仍失败则只发 Markdown 文本，附错误提示 |
| key_points 全部未被覆盖 | 视为生成失败，要求用户补充素材 |
| 标题层级超过 3 级 | quality-checker 报错，强制重写大纲 |
| 字数 < target 的 50% | 视为失败，触发大纲重生成 |

## 8. 扩展

- **新增 topic_category**：在 references/ 增加对应模板 + 在 outline-builder.py 增加 mapping
- **自定义禁用语**：修改 references/quality-checklist.md 的禁用语列表
- **真实飞书集成**：将 scripts/feishu-publisher.py 的 mock 模式改为真实 API 调用
- **多语言支持**：当前仅中文，可在 references/ 增加英文模板
- **协同编辑**：在 Step 6 后追加飞书协作者邀请步骤
