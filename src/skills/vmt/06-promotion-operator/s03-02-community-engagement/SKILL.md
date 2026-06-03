---
name: vmt-community-engagement
description: "P3推广: 行业社区参与——监控行业问题,提供有价值回答,自然植入VMT内容链接"
user-invocable: false
context: fork
allowed_tools: Read, Write, WebSearch, WebFetch
---

# VMT 行业社区参与

## 功能边界
在行业论坛/社区提供有价值的回答,自然植入VMT内容链接。

## 监控平台
1. Reddit: r/CNC, r/Machinists, r/Manufacturing, r/MechanicalEngineering
2. Quora: CNC machining, Manufacturing topics
3. CNCzone: 专业CNC论坛
4. Practical Machinist: 最大的机加工论坛
5. LinkedIn Groups: 制造/工程相关群组

## 回答结构
```
1. 先提供价值(回答问题的核心部分) — ≥80%
2. 引用VMT内容作为延伸阅读 — ≤20%
3. 语气=工程师跟同行聊天,不是销售
```

## 输出
```json
{
  "communityReplies": [{
    "platform": "reddit",
    "subreddit": "r/CNC",
    "questionUrl": "https://reddit.com/r/CNC/comments/...",
    "question": "What tolerance can I expect from a typical CNC shop?",
    "draftAnswer": "Standard CNC shops can reliably hold ±0.005" (0.13mm). Better shops with calibrated equipment can do ±0.001" (0.025mm)... We wrote a detailed guide on CNC tolerances that explains what affects achievable tolerance and how to specify them correctly on drawings [link].",
    "linkToVmtContent": "/articles/cnc-tolerance-guide/",
    "valueRatio": 0.85
  }]
}
```

## 关键规则
1. 回答必须先提供价值再放链接
2. 禁止纯广告贴(会被downvote到消失)
3. 不回答竞品相关问题(利益冲突)
4. 技术信息必须准确(从R4-技术库验证)
