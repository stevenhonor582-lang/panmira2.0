---
name: vmt-email-remarketing
description: "P3推广: 邮件再营销——对已询盘未成交客户定期推送相关内容保持触达"
user-invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 邮件再营销

## 功能边界
对已有询盘但未成交的客户,定期推送相关内容保持触达。

## 目标客户分群
- 询盘后7天未回复: 轻量跟进
- 询盘后30天未回复: 内容推送
- 询盘后90天未回复: 休眠激活

## 邮件模板结构
```
主题: [客户行业] + [内容主题] — 你可能感兴趣
正文:
  1. 一句话问候(不提"为什么不回我")
  2. 1-2篇相关内容简介(为客户提供价值)
  3. 链接到最新内容
  4. 轻CTA("如果有新项目,随时发图纸过来")
```

## 输出
```json
{
  "emailDrafts": [{
    "segment": "医疗行业客户-30天未回复",
    "subject": "Medical device CNC machining — our latest case study",
    "body": "Hi [Name], We recently published a case study about machining 316L stainless steel housings for Class II medical devices — achieving ±0.018mm with full FDA traceability. Thought you might find it relevant given your work on surgical instruments. [Link] If you have a new project coming up, feel free to send the drawings over. Best, VMT",
    "linkedContent": ["/case-studies/medical-housing/"]
  }]
}
```

## 关键规则
1. 每封邮件只推1-2篇最相关内容
2. 不群发Newsletter,按客户行业+关注品类分组
3. 邮件口气="你可能对这个感兴趣",不是"快回来找我们报价"
4. 30天内最多发2封(不过度打扰)
