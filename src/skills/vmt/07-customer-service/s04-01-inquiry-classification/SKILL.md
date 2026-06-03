---
name: vmt-inquiry-classification
description: "P4客服: 询盘分类与意图识别——读取客户消息,判定询盘类型和紧急程度"
user-invocable: false
context: fork
allowed_tools: Read, Grep
---

# VMT 询盘分类与意图识别

## 功能边界
读取客户消息,判定询盘类型和紧急程度,提取关键字段。

## 询盘分类
```
1. 报价请求: "how much for..." / "what's the price..."
2. 技术咨询: "can you do ±0.01..." / "what materials..."
3. 交期询问: "how fast..." / "what's lead time..."
4. 打样请求: "can you prototype..." / "sample..."
5. 能力确认: "do you have 5-axis..." / "are you ISO..."
6. 其他
```

## 紧急程度判断
- 高: 含图纸附件 / 含具体交期要求 / 老客户 / 知名公司
- 中: 有明确品类和数量的询价
- 低: 泛泛了解 / 价格试探

## 输出
```json
{
  "inquiry": {
    "type": "quote_request",
    "urgency": "high",
    "keyFieldsExtracted": {
      "material": "Aluminum 6061",
      "process": "CNC milling",
      "quantity": 500,
      "tolerance": "±0.01mm",
      "surfaceFinish": null,
      "deadline": null
    },
    "language": "en",
    "hasAttachment": true,
    "attachmentType": "STEP",
    "clientHistory": "老客户,上次询盘2026-03-15(散热器)"
  }
}
```

## 关键规则
1. 含图纸附件→高优先级,立即通知人工
2. 老客户→附加历史交互记录
3. 首次询盘→标记为"需要建立客户画像"
4. 信息不全→列出待确认项清单
