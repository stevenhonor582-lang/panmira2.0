---
name: vmt-customer-profile
description: "P4客服: 客户画像更新——每次交互后更新客户画像到R2知识库"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 客户画像更新

## 功能边界
每次客户交互后更新客户画像,沉淀到R2-市场/客户库。

## 记录字段
```yaml
customerProfile:
  industry: "推测行业(医疗/汽车/机器人/...)"
  companyType: "startup/SME/enterprise"
  focusCategories: ["关注品类列表"]
  inquiryFrequency: "首次/偶尔/频繁"
  decisionRole: "engineer/procurement/founder"
  preferredCommunication: "email/phone/chat"
  lastInteraction: "ISO timestamp"
  interactionSummary: "最近交互摘要"
```

## 隐私规则
- 不记录: 客户全名、公司全名(脱敏处理)、电话号码、具体地址
- 可记录: 行业、公司类型、关注品类、询盘模式
- 全部脱敏: 客户→Client A, 项目名→Project X

## 输出
更新R2-市场/客户库中对应记录。

## 关键规则
1. 不记录隐私敏感信息
2. 每次交互后更新(不丢失上下文)
3. 客户画像用于后续交互的个性化(不用于外部传播)
