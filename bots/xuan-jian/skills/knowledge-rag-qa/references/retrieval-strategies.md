# 检索策略

## 三种模式

| 模式 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| `keyword` | 精确术语 / 代码 / 错误码 | 速度快、可解释 | 召回低，措辞变化敏感 |
| `vector` | 语义相近 / 模糊描述 | 召回高，鲁棒 | 慢，需要 embedding |
| `hybrid` | 通用场景（默认） | 综合 keyword + vector | 略慢，需要重排 |

## 加权融合公式

```
final_score = 0.7 * vector_score + 0.3 * keyword_score
```

向量权重高于关键词，因为：
- 向量捕获语义，关键词只匹配字面
- 关键词用于"硬约束"（如错误码、专有名词）

## RRF (Reciprocal Rank Fusion) 重排

```
rrf_score(d) = sum( 1 / (k + rank_i(d)) )  for each retriever i
```

- k = 60（标准值）
- 避免单一检索器的归一化偏差
- 在 hybrid-merge 中作为加权融合之后的二级重排

## 选型决策

```
精确查询（错误码 / API 名）  → keyword
模糊查询（怎么做 / 是什么）  → vector
通用 / 未知                  → hybrid
```

## 过滤策略

- `filters.domain` → 检索前过滤 chunk 元数据
- `filters.tag`    → 精确 tag 匹配
- `filters.date_from/to` → 文档摄取时间窗口

## 性能基线

| 语料规模 | keyword P50 | vector P50 | hybrid P50 |
|----------|-------------|------------|------------|
| 100 chunks | 20ms | 80ms | 120ms |
| 1k chunks | 50ms | 200ms | 280ms |
| 10k chunks | 200ms | 800ms | 1100ms |
