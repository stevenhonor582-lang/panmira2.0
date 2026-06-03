---
name: vmt-negotiation-support
description: "P5报价: 谈判支持——为人工谈判提供竞品数据/差异化卖点/可让步空间"
user_invocable: false
context: fork
allowed_tools: Read, Write, Grep
---

# VMT 谈判支持

## 功能边界
为人工谈判提供数据支撑: 竞品价格参考、VMT差异化优势、可让步空间、备选方案。

## 输出
```json
{
  "negotiationBrief": {
    "competitorPriceRange": "$2.50-3.20/pc (similar 6061 CNC parts, 500 qty)",
    "vmtPrice": "$2.85/pc",
    "vmtAdvantages": [
      "±0.005mm vs 行业±0.01mm → 精度提升50%",
      "ISO 13485认证 → 竞品多数只有ISO 9001",
      "直营工厂无中间商 → 品质可追溯",
      "24h报价 vs 竞品3-5天"
    ],
    "acceptableDiscount": {
      "maxDiscount": "8%",
      "preferredConcession": "免费升级表面处理(Type II→Type III)",
      "valueAddOptions": ["送SPC报告", "免NRE费用", "优先排产"],
      "noGoPrice": "$2.30/pc (成本$1.745 + 最低15%利润)"
    },
    "talkingPoints": [
      "如果客户说'竞品更便宜'→ 强调精度和认证差异",
      "如果客户说'数量大要折扣'→ 给value-add而不是降价",
      "如果客户说'需要更快交期'→ 加急费30%,不免费加快"
    ]
  }
}
```

## 不让价策略
```
不让价时给value-add:
- 不降价但送表面处理升级
- 不降价但免NRE费用(量大时NRE本来就可免)
- 不降价但送SPC检测报告
- 不降价但优先排产(缩短交期)
```

## 关键规则
1. 不让价超过底线(noGoPrice = 成本 + 最低利润率)
2. 不让价时给value-add(让客户觉得赚了)
3. 永远有备选方案
4. 每次谈判后更新R1-竞品库的价格数据
