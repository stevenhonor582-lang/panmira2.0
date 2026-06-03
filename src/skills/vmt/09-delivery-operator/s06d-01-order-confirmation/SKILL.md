---
name: vmt-order-confirmation
description: "P6交付: 订单确认——将确认报价单转化为内部生产工单"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 订单确认与生产工单生成

## 功能边界
将客户确认的报价单+PO转化为内部生产工单。

## 工单结构
```yaml
workOrder:
  woNumber: "VMT-WO-2026-0526-001"
  partDetails:
    name: "Bracket Assembly"
    material: "Aluminum 6061-T6"
    quantity: 500
    maxDim: "200×150×80mm"
  tolerances:
    general: "ISO 2768-m"
    critical: ["±0.01mm on mating surfaces (marked RED on drawing)"]
  finishSpec: "Anodizing Type II, Black, 5-15μm"
  qcRequirements:
    level: "AQL 1.0 normal"
    criticalDims: "100% inspection"
    documentation: ["Inspection report", "Material cert", "SPC for critical dims"]
  deadline: "2026-06-23 (4 weeks)"
  packingSpec: "Individual bubble wrap, export carton"
  shippingMethod: "DHL Express"
```

## 关键要求醒目标注
```
🔴 CRITICAL:
  - ±0.01mm on mating surfaces — 100% inspection required
  - Material cert from mill required
  - Deadline: 2026-06-23 (hard deadline, client's production schedule)
```

## 关键规则
1. 工单关键要求与客户PO一致(交叉验证)
2. 特殊要求(材质证书/全检/特殊包装)必须醒目标注
3. 交期必须明确,不写"ASAP"
