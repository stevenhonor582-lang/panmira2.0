# 技术文档（tech-docs）领域

## 范围

- API 文档
- 架构设计文档
- 技术规范 / RFC
- README / 教程
- 代码注释提取

## 切片要点

- 保留代码块完整
- 保留 API 签名（含参数类型）
- 保留 import / package 路径

## 检索增强

- 错误码作为硬关键词（keyword 模式权重 +0.2）
- API 名称 / 类名作为命名实体
- 支持代码片段模糊匹配（去除标点后 substring）

## 引用风格

- 引用时附 `文件:行号`（如 `src/api.py:42`）
- 链接到源仓库（git permalink）
- 长代码块折叠（> 10 行的代码块用 `<details>` 包裹）

## 术语表

- "skill"  → 玄鉴的功能单元，对应一个 manifest.json
- "bot"    → 玄鉴 / 不盈 / 信言 / 守敬 之一
- "chunk"  → 知识库文档的最小检索单元
- "RAG"    → Retrieval-Augmented Generation
