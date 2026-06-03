---
name: vmt-drawing-analysis
description: "P5报价: 图纸解析与需求提取——从STP/STEP/PDF中提取报价所需核心参数"
user_invocable: false
context: fork
allowed_tools: Read, Bash
---

# VMT 图纸解析与需求提取

## 功能边界
从客户上传的STP/STEP/PDF/图纸中提取报价所需核心参数。

## 提取字段
```yaml
rfq:
  material: "材料牌号"
  maxDim: "最大外形尺寸(mm)"
  criticalTolerances: ["关键公差列表"]
  surfaceFinish: "表面处理要求"
  estimatedFeatures: "预估加工特征数(孔/槽/螺纹/...)"
  quantity: "数量"
  deadline: "交期要求"
  specialRequirements: ["特殊要求(材质证书/全检/特殊包装/...)"]
```

## 特征计数法(用于耗时估算)
```
加工时间 =
  孔数 × 钻孔时间 +
  槽数 × 开槽时间 +
  面积 × 铣削时间 +
  螺纹数 × 攻丝时间 +
  设定时间 × 设定次数
```

## 输出
```json
{
  "rfq": {
    "material": "Aluminum 6061-T6",
    "maxDim": "200×150×80mm",
    "criticalTolerances": ["±0.01mm on mating surfaces", "±0.05mm general"],
    "surfaceFinish": "Anodizing Type II (Black)",
    "estimatedFeatures": { "holes": 12, "slots": 2, "pockets": 3, "threads": 6 },
    "quantity": 500,
    "deadline": "4 weeks",
    "specialRequirements": ["Material cert required", "SPC report for critical dims"],
    "missingInfo": []
  }
}
```

## 关键规则
1. 图纸不清晰→列出待确认项,不猜测
2. 缺失关键信息(材料/数量/交期)→立刻回问客户
3. 不在信息不全时硬报价
4. 复杂几何特征需人工工程师评估
