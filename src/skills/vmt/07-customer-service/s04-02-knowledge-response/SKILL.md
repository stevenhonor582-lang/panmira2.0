---
name: vmt-knowledge-response
description: "P4客服: 知识检索与应答生成——从知识底座检索,生成专业准确的回复草稿"
user_invocable: false
context: fork
allowed_tools: Read, Grep, Write
---

# VMT 知识检索与应答生成

## 功能边界
根据询盘分析结果,从知识底座检索相关信息,生成专业准确的回复草稿。

## 知识检索策略
```
报价请求 → R6成本库 + R4技术库(工艺参数) + R5案例库(类似零件)
技术咨询 → R4技术库(材料/工艺/公差) + R10合规库
交期询问 → R4技术库(各工艺交期) + R7交付库
打样请求 → R4技术库(打样流程) + R6成本库(样品报价)
```

## 回复模板结构
```
1. 正面回答(直接回答客户问题,不绕弯)
2. 1-2个支撑数据(具体数字/案例/认证)
3. 下一步行动(明确告诉客户怎么做)
4. 时间承诺(什么时候回复/完成)
5. 不确定的→诚实说"让我确认后回复你"
```

## 输出
```json
{
  "replyDraft": {
    "greeting": "Hi [Name],",
    "directAnswer": "Yes, we can machine 6061 aluminum parts to ±0.01mm tolerance.",
    "supportingDetails": [
      "Our linear tolerance is ±0.005mm as standard, so ±0.01mm is well within our capability.",
      "We recently delivered 500 medical housings in 316L at ±0.018mm with zero rejects."
    ],
    "nextSteps": "Upload your STEP file at [link] — I'll review the geometry and send a detailed quote within 4 hours.",
    "timeCommitment": "Quote within 4 hours, standard lead time 10-15 business days",
    "disclaimerIfNeeded": null
  }
}
```

## 关键规则
1. 先直接回答问题,再补充细节
2. 不知道的明确说"让我确认后回复你",不编造
3. 每条技术数据从知识底座检索(不靠记忆)
4. 回复语气=工程师跟同行说话,不是客服念话术
5. 回复在24小时内(至少发"收到,正在确认")
