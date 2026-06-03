---
name: vmt-quotation-generation
description: "P5报价: 报价生成——基于成本+利润率+竞品价格区间生成正式报价单"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 报价生成

## 功能边界
基于成本核算+利润率策略+竞品价格参考,生成正式报价单。

## 定价公式
```
报价价格 = 单位成本(含数量系数) × (1 + 利润率)

利润率参考:
  标品(通用零件): 15-25%  (低利润抢量)
  定制品: 25-40%           (技术含量溢价)
  高难度/特殊材料: 40-60%   (风险溢价)
  老客户/大单: 10-20%      (长期合作折扣)
```

## 报价单必须包含
```yaml
报价单:
  - 客户信息
  - 零件描述(材料/工艺/数量/关键要求)
  - 单价 + 总价(含/不含NRE)
  - NRE费用(单独列出)
  - 交期(标准/加急)
  - 付款条件(预付款比例/尾款条件)
  - 有效期(通常14天)
  - 不含项(exclusions: 明确写清楚不包含什么)
  - 技术备注(公差标准/表面处理/检测标准)
```

## 竞品价格锚定
从R1-竞品库获取同类零件价格区间,确保报价合理:
- VMT报价不在竞品价格范围→检查是否有差异化支撑
- VMT报价高于竞品→报价单中必须有差异化说明
- VMT报价低于竞品→确认成本核算无误(避免亏钱)

## 输出
```json
{
  "quotation": {
    "quotationNumber": "VMT-Q-2026-0526-001",
    "customerInfo": "脱敏客户信息",
    "partDescription": "Aluminum 6061-T6 bracket, CNC milled, Black anodized",
    "quantity": 500,
    "unitPrice": 2.85,
    "totalPrice": 1425.00,
    "nreCost": 200.00,
    "leadTime": "10-15 business days (standard)",
    "expeditedLeadTime": "5-7 business days (+30% surcharge)",
    "paymentTerms": "50% deposit, 50% before shipment",
    "validityPeriod": "14 days from date of quotation",
    "exclusions": ["Shipping cost not included", "Custom packaging at extra cost"],
    "technicalNotes": ["All tolerances per ISO 2768-m unless otherwise specified", "Anodizing per MIL-PRF-8625 Type II"]
  }
}
```

## 关键规则
1. 报价单必须有有效期(市场价波动)
2. 明确写清楚不含什么(避免后期纠纷)
3. NRE费用单独列出不混淆
