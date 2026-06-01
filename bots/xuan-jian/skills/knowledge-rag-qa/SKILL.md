---
name: knowledge-rag-qa
version: 1.0.0
bot_id: xuan-jian
layer: 2
status: stable

description: |
  Use when: 用户问"XX 是什么/怎么用/为什么"且涉及已摄取知识库内容、@玄鉴 说"查一下/找一下"、用户粘贴文本并问"这段什么意思/有相关资料吗"
  Do not use when: 闲聊、即时新闻查询、需联网的实时信息、代码评审（升级到不盈 code-review）、方案撰写（升级到信言 write-proposal）

requires:
  mcp: []
  scripts:
    - scripts/chunk-text.py
    - scripts/keyword-search.py
    - scripts/embed-search.py
    - scripts/hybrid-merge.py
    - scripts/format-answer.py
  references:
    - references/retrieval-strategies.md
    - references/chunking-rules.md
    - references/prompt-template.md
    - references/citation-format.md
    - references/domains/tech-docs.md
    - references/domains/meeting-notes.md
    - references/domains/project-history.md

resources:
  timeout_ms: 60000
  max_memory_mb: 512
  max_concurrent: 5

tags:
  - rag
  - qa
  - retrieval
  - knowledge-base
  - citation
---

# Knowledge RAG QA

> 知识库检索增强问答：用户问题 → 关键词/向量混合检索 → Top-K 片段 → LLM 合成答案 + 引用
> 所属 Bot：玄鉴 (xuan-jian) | Layer 2 | v1.0.0

## 1. 触发条件

### 1.1 触发场景

- 用户问"XX 是什么 / 怎么用 / 为什么"，且问题涉及已摄取到知识库的内容
- 用户粘贴文本后追问："这段什么意思 / 有相关资料吗 / 哪里定义的"
- 用户 @玄鉴 说"查一下 / 找一下 / 搜一下 / 知识库里有吗"
- 用户引用了某文档/项目名并要求"出处 / 来源 / 引用"

### 1.2 不触发场景

- 闲聊、问候、表达情绪
- 实时新闻 / 股价 / 天气（需要联网，跳出或转 fallback）
- 代码评审 / diff 分析（升级到 `bu-ying / code-review`）
- 方案 / 报告 / 文档撰写（升级到 `xin-yan / write-proposal`）
- 主观判断 / 推荐意见（玄鉴只基于知识库事实回答）

## 2. 核心流程

```
用户问题 (query)
  ↓
[Clarification Engine] 提取 query / top_k / filters / mode
  ↓
Step 1: 解析 query
  ├─ 提取关键词（中英文分词）
  ├─ 识别意图（定义/用法/原因/出处）
  └─ 套用 filters (domain/date/tag)
  ↓
Step 2: scripts/chunk-text.py < corpus
  ├─ 按段落/标题/长度切片（max 500 字符/块，overlap 50）
  └─ 输出: chunks[]
  ↓
Step 3: 并行检索
  ├─ scripts/keyword-search.py   → keyword_results (BM25/TF-IDF)
  └─ scripts/embed-search.py     → vector_results  (余弦相似度)
  ↓
Step 4: scripts/hybrid-merge.py
  ├─ 加权融合 (vector*0.7 + keyword*0.3)
  ├─ RRF 重排 (k=60)
  └─ 截断 top-K (K=5)
  ↓
Step 5: 加载 prompt 模板
  ├─ 读 references/prompt-template.md
  └─ 注入 chunks → LLM prompt
  ↓
Step 6: LLM 合成答案
  ├─ 基于 chunks 事实（不外推）
  ├─ 每个事实点标 [N] 引用
  └─ 输出: { answer, citations[] }
  ↓
Step 7: 置信度判断
  ├─ confidence ≥ 0.7 → 返回 answer + citations
  ├─ confidence 0.5-0.7 → 返回 answer + 提示"建议核实"
  └─ confidence < 0.5 → 返回"知识库无相关信息"
  ↓
Step 8: scripts/format-answer.py
  ├─ 套用 references/citation-format.md
  └─ 输出: Markdown 答案 (含引用列表)
  ↓
Step 9: 写审计日志 runs/<date>/<query_id>/exec.log
  ↓
Step 10: 飞书卡片回复
  ├─ 答案正文
  ├─ 引用列表 (来源 + 链接 + 片段)
  └─ 置信度标签
```

### 2.1 详细步骤

1. **解析输入**：从消息提取 `query`（必填）、`top_k`（默认 5）、`filters`（可选）、`mode`（默认 hybrid）
2. **文档切片**：知识库文档按段落/标题切片，每块 ≤ 500 字符，相邻块 overlap 50 字符
3. **并行检索**：keyword_search + embed_search 同时跑，timeout 30s
4. **结果融合**：加权 + RRF 重排，截断 top-K
5. **LLM 合成**：基于 top-K chunks 生成答案，每个事实点必须标 [N]
6. **置信度评估**：取 top-1 分数与答案完整度综合判断
7. **格式化输出**：套用 citation-format 输出 Markdown
8. **写审计日志**：记录 query + retrieved_chunks + answer + confidence
9. **飞书回复**：卡片显示答案 + 引用 + 置信度

## 3. 边界规则

| # | 规则 | 触发后行为 |
|---|------|-----------|
| 1 | 不联网搜索 | 知识库无相关内容时直接说"未找到"，不调外部 API |
| 2 | 不做主观判断 | 答案必须基于 chunks 事实，禁止"我认为 / 应该是" |
| 3 | 不混合多源事实 | 不同来源的事实点必须标清出处 [N] |
| 4 | 置信度 < 0.5 | 返回 no-answer 模板，不强行生成 |
| 5 | 不修改知识库 | 只读，写入由 `knowledge-ingest` skill 负责 |
| 6 | chunks 数量 = 0 | 返回"知识库无相关信息"，不编造 |
| 7 | 单 query 超时 30s | 截断到当前结果，记录 timeout 日志 |
| 8 | LLM 拒绝回答（policy 触发） | 返回"该问题暂无法回答" + 原因 |

## 4. 文件读取时机

| 步骤 | 读取文件 | 用途 |
|------|---------|------|
| Step 1 解析 | `references/retrieval-strategies.md` | 选择检索模式（keyword/vector/hybrid） |
| Step 2 切片 | `references/chunking-rules.md` | 切片参数（长度/overlap/边界） |
| Step 5 加载 prompt | `references/prompt-template.md` | LLM prompt 模板 |
| Step 6 合成 | `references/citation-format.md` | 引用格式规范 |
| Step 6 合成 | `references/domains/<domain>.md` | 领域特定术语/风格 |
| Step 8 格式化 | `references/citation-format.md` | Markdown 输出模板 |

## 5. 脚本调用时机

| 步骤 | 命令 | 输入 | 输出 |
|------|------|------|------|
| Step 2 | `scripts/chunk-text.py` | 文档字符串 (stdin) | JSON: chunks[] |
| Step 3a | `scripts/keyword-search.py <query> <corpus>` | query + corpus | JSON: results[] |
| Step 3b | `scripts/embed-search.py <query> <corpus>` | query + corpus | JSON: results[] |
| Step 4 | `scripts/hybrid-merge.py <kw.json> <vec.json>` | 两份检索结果 | JSON: merged[] |
| Step 8 | `scripts/format-answer.py` | answer + citations (stdin) | Markdown (stdout) |

### 5.1 脚本返回约定

- 成功：stdout 输出 JSON / Markdown，exit code = 0
- 失败：stderr 输出错误信息，exit code ≠ 0
- 空结果：返回 `{"results": []}`，不视为失败

### 5.2 优雅降级

- embed-search 依赖 numpy 不可用时，fallback 到纯 Python hash 向量
- 知识库为空时，所有检索返回 `{"results": []}`
- LLM 不可用时，仅返回原始 chunks（无合成答案）

## 6. 验收标准

| # | 指标 | 目标 | 测量 |
|---|------|------|------|
| 1 | 检索 P50 延迟 | < 800ms | 计时（Step 2-4） |
| 2 | 引用准确率 | ≥ 95% | 50 条样本人工核对 |
| 3 | "未找到"准确率 | ≥ 99% | 50 条负样本 |
| 4 | 答案完整率 | ≥ 90% | 50 条已知答案样本 |
| 5 | 幻觉率 | < 5% | 50 条样本 |
| 6 | 引用格式合规率 | 100% | 自动化测试 |
| 7 | 单 query 端到端 | < 30s | 含 LLM 合成 |

## 7. 失败处理

| 失败场景 | 处理 |
|---------|------|
| 知识库为空 | 返回"知识库暂无内容，请先通过 knowledge-ingest 摄取" |
| query 为空 | 触发反问："请描述您想了解的问题" |
| chunks 检索全 0 命中 | 返回"未找到相关知识，建议换个问法或补充源文档" |
| LLM 不可用 | 返回 top-K chunks 原文（无合成） |
| 切片异常（编码错误） | 跳过该文档，记录日志，继续处理其他 |
| 超时（> 30s） | 截断到当前结果，标记 partial |
| 置信度 < 0.5 | 返回 no-answer 模板，不强行回答 |

## 8. 扩展

- **多知识库**：通过 `filters.kb_id` 限定检索范围
- **多语言**：keyword-search 支持中英文分词（jieba 缺失时退化到字符切分）
- **真实 embedding**：embed-search 当前为 hash mock，可替换为 sentence-transformers / OpenAI embedding
- **pgvector 集成**：Step 3b 可替换为 `scripts/vector_search.py` 走 PostgreSQL
- **cross-encoder 重排**：在 hybrid-merge 之后可加 rerank 步骤
- **流式输出**：Step 6 LLM 合成可改为流式，逐块回传飞书卡片
