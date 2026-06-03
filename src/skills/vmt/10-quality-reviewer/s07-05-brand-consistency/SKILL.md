---
name: vmt-brand-consistency
description: "P2质审: 品牌一致性检查——VMT定位/禁用词/信任数据可验证性全面检查"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 品牌一致性检查

## 功能边界
检查内容是否与VMT品牌定位一致: 直营工厂/工程师文化/数据说话/不做过度营销。

## 品牌定位检查
```
□ "直营工厂,无中间商"定位是否贯穿全文?
□ 语气=工程师跟同行说话(不是销售不是客服)?
□ 是否有"为你着想"的内容(设计指南/行业陷阱警告)?
□ 是否是"证明"而非"推销"?
```

## 禁用词清单
```
行业超级词(禁用):
  - industry-leading / world-class / best-in-class
  - premier / top-tier / unparalleled
  - revolutionary / game-changing / groundbreaking

形容词堆砌(禁用):
  - 连续3个及以上形容词修饰同一名词

自我吹嘘句式(禁用):
  - "we pride ourselves on..."
  - "we are the best at..."
  - "nobody does it better than us"
  - "trust us because we are the most..."
```

## 可验证性检查
```
□ 所有数字能从知识底座找到来源?
□ 所有认证编号正确?
□ 所有案例真实(非编造)?
□ 所有"数据证明"有数据?
```

## 差异化检查
```
□ 内容有至少1个VMT独有的事实(不是任何竞品都能用)?
□ 差异化体现在具体参数/数据/案例上(不是形容词)?
```

## 输出
```json
{
  "brandConsistencyReport": {
    "overallAlignment": "good",
    "violations": [
      { "type": "banned_word", "found": "industry-leading", "location": "M03-Overview intro", "action": "删除,改为具体数据" }
    ],
    "differentiationCheck": { "hasUniqueFacts": true, "facts": ["直营工厂无中间商", "ISO 13485认证"] },
    "verifiabilityCheck": { "unverifiableClaims": ["M02中'99.2% On-Time'在R4-技术库中未找到来源数据"] },
    "verdict": "FAIL - 1处禁用词 + 1处不可验证声明,退回修改"
  }
}
```

## 关键规则
1. 禁用词一个不留
2. 不可验证的声明→要么补来源要么删除
3. 内容必须体现VMT独有事实
4. 读起来像"任何一家CNC工厂都能用的文案"→退回重写
