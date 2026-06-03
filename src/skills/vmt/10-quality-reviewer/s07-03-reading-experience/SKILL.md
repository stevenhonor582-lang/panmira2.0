---
name: vmt-reading-experience
description: "P2质审: 阅读体验三合一审查——模块级阅读+文章级缝合+强制精简，替代旧版vmt-readability-audit"
user_invocable: false
context: fork
allowed_tools: Read, Write, Edit
---

# VMT 阅读体验审查（三合一）

## 功能边界
合并了原 readability-audit + narrative-flow-check + force-trim。

## 三个扫描维度
- 扫描A: 模块级阅读（5秒/30秒/3分钟测试）
- 扫描B: 文章级缝合（过渡/去重/语调/节奏/弧线）
- 扫描C: 强制精简（密度感知四档）
