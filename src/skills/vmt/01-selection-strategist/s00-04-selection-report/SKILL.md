---
name: vmt-selection-report
description: "P0选品: 综合市场机会+竞品缺口+产能匹配，输出最终选品推荐决策报告"
user-invocable: false
context: fork
allowed-tools: Read, Write, Bash
---

# VMT 选品决策报告

## 功能边界
综合S00-01/02/03的全部输出，生成最终选品推荐决策报告。

## 输入
- S00-01 市场机会扫描结果
- S00-02 竞品产品线拆解结果
- S00-03 产能匹配分析结果

## 输出
```json
{
  "selectionReport": {
    "recommended": [{
      "category": "铝散热器定制加工",
      "priority": 1,
      "rationale": "月搜索量12000+趋势上升，竞品Wellste一家独大但内容深度不足，VMT设备+材料+认证全部就绪",
      "revenueEstimate": { "conservative": "5万/月", "optimistic": "15万/月" },
      "riskLevel": "low",
      "timeToMarket": "2周(已有知识底座)"
    }],
    "watchlist": [{ "category": "...", "reason": "趋势上升但需新设备", "triggerCondition": "月搜索量>5000时重新评估" }],
    "rejected": [{ "category": "...", "reason": "竞争白热化且VMT无差异化优势" }]
  }
}
```

## 推荐标准
- 推荐: 机会分>70 + 产能匹配A/B级 + 竞品有明显缺口
- 观察: 机会分>70但产能匹配C级 → 等条件成熟再推进
- 拒绝: 机会分<50 或 产能匹配D级

## 关键规则
1. 推荐≤20个品类
2. 每个推荐必须有: 理由+收入预估(保守/乐观)+风险+上市时间
3. 拒绝品类必须有明确理由(避免反复讨论)
4. 报告包含"下一步行动": 推荐品类需要补充哪些知识底座
