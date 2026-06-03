---
name: vmt-ai-smell-check
description: "P2内容生产: AI味检测+自动修复——2-pass流程，自动检测10项AI味标记并修复，替代旧版vmt-de-ai-proofing"
user_invocable: false
context: fork
allowed_tools: Read, Write, Edit
---

# VMT AI味检测与修复

## 功能边界
对生成内容执行AI味检测+自动修复。合并了原vmt-de-ai-proofing。

## 2-Pass流程
- Pass 1: 自动检测+修复
- Pass 2: 验证修复效果

## AI味检测清单(10项)
逐项检查，任一未通过→自动修复。
