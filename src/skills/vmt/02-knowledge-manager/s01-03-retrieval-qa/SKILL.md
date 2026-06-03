---
name: vmt-retrieval-qa
description: "P1知识管理: 定期测试知识检索的准确性和召回率"
user-invocable: false
context: fork
allowed-tools: Read, Grep, Bash
---

# VMT 检索质量验证

## 功能边界
定期测试知识检索的准确性和召回率，确保下游bot能检索到正确信息。

## 测试方法
1. 预设50个标准查询(覆盖R0-R10各库的高频查询)
2. 执行查询，记录Top3返回结果
3. 对比"期望答案"与"实际返回"，计算精准率和召回率

## 输出
```json
{
  "retrievalReport": {
    "testDate": "2026-05-26",
    "overallPrecision": 0.87,
    "overallRecall": 0.82,
    "failures": [{
      "query": "6061 vs 7075 tensile strength",
      "expectedAnswer": "6061: 310 MPa, 7075: 572 MPa",
      "actualTop3": ["铝合金概述...", "CNC材料选择指南...", "..."],
      "precision": 0,
      "recall": 0,
      "gap": "R4-技术库中6061和7075的性能数据未被检索命中"
    }]
  }
}
```

## 标准查询集(节选)
1. "CNC铣削能做到什么公差" → R4
2. "6061铝合金性能参数" → R4
3. "医疗行业需要什么认证" → R10
4. "竞品RapidDirect的产品线" → R1
5. "铝散热器表面处理选项" → R4
... (共50条)

## 触发条件
- 精准率<80% → 触发知识重组
- 召回率<70% → 触发知识补充
- 单条查询Top3全不相关 → 标记为严重缺口

## 关键规则
1. 每月至少执行一次全量检测
2. 知识底座有重大更新后立即执行增量检测
3. 失败案例必须记录具体原因和修复方案
