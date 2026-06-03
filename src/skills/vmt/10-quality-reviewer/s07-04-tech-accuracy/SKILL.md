---
name: vmt-tech-accuracy
description: "P2质审: 技术准确性交叉验证——将生成内容的技术参数与R4-技术库交叉比对"
user_invocable: false
context: fork
allowed_tools: Read, Grep
---

# VMT 技术准确性交叉验证

## 功能边界
将生成内容中的所有技术参数(公差/材料性能/工艺参数/认证编号/交期等)与R4-技术库交叉比对。任何不一致→标记为"技术错误"退回。

## 交叉验证清单
```
比对项:
  □ 公差数值 vs R4-技术库/工艺参数/
  □ 材料性能 vs R4-技术库/材料数据/
  □ 最大加工尺寸 vs R4-技术库/设备能力/
  □ 表面处理参数 vs R4-技术库/表面处理/
  □ 认证编号 vs R10-合规库/
  □ 交期承诺 vs R4-技术库/各工艺交期/ (不能比实际能力快)
  □ 设备型号 vs R4-技术库/设备清单/
  □ 材料价格区间 vs R6-成本库/
```

## 常见错误类型
```
1. 数值夸大: 生成写了±0.002mm但实际能力是±0.005mm
2. 材料错配: 说7075可以做Type II阳极但实际Type II对7075效果很差
3. 认证造假: 写了ISO 13485但实际证书编号不对或未获得
4. 交期夸大: 写3-5天但实际该工艺最少7天
5. 设备编造: 写了ZEISS CMM但实际用的是其他品牌
```

## 输出
```json
{
  "techAccuracyReport": {
    "totalParamsChecked": 34,
    "paramsMatched": 32,
    "paramsMismatched": 2,
    "mismatches": [
      { "module": "M04-TechSpecs", "param": "Max part size", "generated": "1000×800×600mm", "actual": "800×600×500mm", "severity": "CRITICAL", "action": "修正为800×600×500mm" },
      { "module": "M05-MaterialSelector", "param": "7075 relative cost", "generated": "1.2", "actual": "1.5", "severity": "MEDIUM", "action": "修正为1.5" }
    ],
    "verdict": "FAIL",
    "action": "2处技术错误,修正后重新验证"
  }
}
```

## 错误严重度
- CRITICAL: 数据与R4-技术库偏差>20% → 立即修正
- HIGH: 偏差10-20% → 修正
- MEDIUM: 偏差<10% → 修正或标注为"估算"
- LOW: 非关键参数的微小偏差 → 标注为后续修正

## 关键规则
1. 技术错误CRITICAL/HIGH级别→直接退回
2. 每处错误标注: 位置+生成值+实际值+修正建议
3. 如果R4-技术库中查不到该参数→标记为"知识底座缺失"→通知知识管理员
