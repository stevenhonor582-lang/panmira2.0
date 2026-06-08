# 引用格式规范

## 引用编号规则

- 使用方括号数字：`[1] [2] [3]`
- 编号按引用在答案中出现的顺序分配
- 同一条事实不重复编号
- 末尾必须列出全部引用

## Markdown 答案结构

```markdown
{answer_body}

**引用：**
[1] {source_title_1} - {chunk_snippet_1}
[2] {source_title_2} - {chunk_snippet_2}
```

## 引用详情格式

每条引用包含：
- `source_title`：文档标题
- `source_id`：文档 ID（用于跳转）
- `chunk_text`：被引用的 chunk 摘要（前 100 字符 + "..."）
- `score`：相关度（0-1）
- `url`：源链接（如有）

## 置信度标签

| confidence | 标签 | 文案 |
|------------|------|------|
| ≥ 0.85 | 高 | （无追加） |
| 0.70-0.85 | 中 | "**提示**：置信度中等，建议核实关键事实" |
| 0.50-0.70 | 低 | "**提示**：置信度较低，答案仅供参考" |
| < 0.50 | 无 | 返回 no-answer 模板 |

## No-Answer 模板

当 confidence < 0.5 或 chunks 为空时：

```markdown
知识库中暂无与" {query} "直接相关的信息。

**建议：**
- 换个问法（更具体 / 更通用）
- 确认问题涉及的文档已通过 knowledge-ingest 摄取
- 补充源文档后再试
```

## 示例

```markdown
knowledge-rag-qa 是玄鉴的检索增强问答 skill [1]，通过关键词 + 向量混合检索找出 Top-K 片段，再由 LLM 合成答案并附引用 [1]。

**引用：**
[1] skill-framework-design.md - "knowledge-rag-qa 通过混合检索（关键词 + 向量）从知识库中找出 Top-K 片段..."
```

## 校验规则

- 自动化测试检查：所有 `[N]` 出现的位置都对应 citations[] 中的某项
- 自动化测试检查：所有 citations[] 中的项都至少被引用一次（除非 include_citations=false）
- 自动化测试检查：引用编号连续（无跳号）
