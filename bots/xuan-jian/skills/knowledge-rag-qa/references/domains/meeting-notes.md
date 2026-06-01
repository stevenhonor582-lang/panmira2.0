# 会议纪要（meeting-notes）领域

## 范围

- 周会 / 月会 / 复盘
- 1-on-1
- 客户会议
- 决策会议
- 临时讨论记录

## 切片要点

- 按议题（agenda）切
- 每议题一个 chunk
- 决议（decision）独立标 chunk_id="decision-{N}"

## 检索增强

- 时间作为元数据，filters.date_from/to 优先
- 参会者作为 tag
- 决议类内容加权（decision chunks score * 1.2）

## 引用风格

- 引用时附 `日期:议题`（如 `2026-05-15:技术债清理`）
- 链接到会议记录原文
- 决议附决策人（`决策：@张三`）

## 特殊元数据

```json
{
  "meeting_date": "2026-05-15",
  "attendees": ["alice", "bob", "carol"],
  "decisions": ["decision-1", "decision-2"],
  "action_items": ["alice: 写文档", "bob: 改代码"]
}
```
