---
name: vmt-capability-match
description: "P0选品: 评估VMT对候选品类的制造能力匹配度"
user-invocable: false
context: fork
allowed-tools: Read, Grep, Bash
---

# VMT 产能匹配分析

## 功能边界
评估VMT对候选品类的制造能力：设备/材料/公差/交期/认证是否满足。

## 输入
- 候选品类技术要求(S00-01/02输出)
- R4-技术库(VMT设备清单/工艺能力/材料能力)
- R10-合规/认证库

## 输出
```json
{
  "capabilityReport": [{
    "category": "铝散热器",
    "feasible": true,
    "requiredEquipment": ["CNC加工中心", "CMM"],
    "hasEquipment": true,
    "requiredCertifications": ["ISO 9001"],
    "hasCertifications": true,
    "constraints": ["最大尺寸800mm以内"],
    "investmentNeeded": "none"
  }]
}
```

## 匹配等级
- A级(无需新投资): 设备+材料+认证全部就绪 → 标记为最高优先级
- B级(需小投资): 需要添置刀具/夹具等耗材 → 标记为中优先级
- C级(需大投资): 需要新设备/新认证 → 标记为战略储备，不立即推进
- D级(不可行): 核心能力缺失且短期无法补齐 → 标记为不推荐

## 关键规则
1. 必须对照R4-技术库真实数据，不猜测能力边界
2. 公差要求高于VMT实际能力→降级或标记风险
3. 材料不在VMT常规清单→标注需要供应商验证
