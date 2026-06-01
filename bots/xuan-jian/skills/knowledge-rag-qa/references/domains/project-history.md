# 项目历史（project-history）领域

## 范围

- 立项书 / 需求文档
- 里程碑记录
- 事故复盘（postmortem）
- 架构演进记录
- 重要决策日志（ADR / Architecture Decision Record）

## 切片要点

- 按时间线 / 里程碑切
- 一次事故 / 一次决策 = 1 chunk
- 关键人物 / 时间作为元数据

## 检索增强

- 时间区间过滤高频
- "为什么 / 当时怎么考虑" 类问题加权 vector 检索
- 决策类查询优先返回 ADR 类型的 chunk

## 引用风格

- 引用时附 `时间:事件`（如 `2025-Q3:VMT 数据中台启动`）
- 链接到原始文档 / wiki
- 决策附背景（`背景：客户 X 提出...`）

## 关键元数据

```json
{
  "event_date": "2025-09-15",
  "event_type": "kickoff" | "milestone" | "incident" | "decision" | "release",
  "stakeholders": ["alice", "bob"],
  "related_docs": ["doc-001", "doc-002"]
}
```
