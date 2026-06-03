---
name: vmt-cost-calculation
description: "P5报价: 成本核算——材料+加工+表面处理+质检+包装+物流+NRE"
user_invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 成本核算

## 功能边界
基于图纸解析结果,计算完整制造成本。

## 成本公式
```
材料成本 = 毛坯重量 × 材料单价 × (1 + 损耗率)

加工成本 = Σ(各特征加工时间) × 工时费率 × 设定次数
  钻孔时间: 孔深/进给速度 × 孔数
  铣削时间: 面积/材料去除率
  攻丝时间: 螺纹深度/进给速度 × 螺纹数

表面处理成本 = 处理面积 × 处理单价

质检成本 = 检测时间 × 检测费率(按质检等级)
  AQL抽样: 基础费率
  100%全检: 2×基础费率
  加SPC报告: +20%

包装成本 = 包装材料 + 人工(按零件尺寸/重量)

物流成本 = R7-交付库查表(按国家/重量)

NRE费用 = 编程调试(一次性) + 夹具制作(一次性,量大可免)
```

## 输出
```json
{
  "costBreakdown": {
    "materialCost": 125.00,
    "machiningDetail": { "estimatedHours": 8.5, "hourlyRate": 45, "machiningCost": 382.50 },
    "surfaceFinishCost": 75.00,
    "qcCost": 30.00,
    "packagingCost": 15.00,
    "shippingCost": 45.00,
    "nreCost": 200.00,
    "totalCost": 872.50,
    "unitCost": 1.745,
    "unitCostExclNRE": 1.345
  }
}
```

## 数量系数
- 1-10件: ×1.5
- 10-100件: ×1.2
- 100-1000件: ×1.0
- 1000+件: ×0.85

## 关键规则
1. 材料单价从R6-成本库实时获取
2. 加工时间估算偏保守(低估会亏钱)
3. NRE费用单独列出(一次性,不摊入单价)
4. 不确定的参数标注范围而非精确值
