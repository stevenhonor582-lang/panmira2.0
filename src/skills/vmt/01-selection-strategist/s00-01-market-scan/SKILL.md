---
name: vmt-market-scan
description: "P0选品: 监控行业趋势、大流量词、询盘模式，识别需求热度高但供给不足的品类机会"
user-invocable: false
context: fork
allowed-tools: Read, Grep, WebSearch, WebFetch, Bash
---

# VMT 市场机会扫描

## 功能边界
监控行业趋势+大流量词+询盘模式，识别需求热度高但供给不足的品类。

## 输入
- 行业报告(Google Trends / 海关出口数据)
- 竞品站流量估计(Semrush/Similarweb数据)
- VMT现有询盘数据分析

## 输出
```json
{
  "opportunities": [{
    "category": "铝散热器",
    "searchVolume": 12000,
    "trend": "up",
    "competitionLevel": "medium",
    "vmtCapabilityMatch": 0.85,
    "score": 78
  }],
  "generatedAt": "ISO timestamp"
}
```

## 评分公式
机会分数 = 需求热度(0-40) × 竞争强度(0-30) × VMT能力匹配(0-30)

## 关键规则
1. 分数>70才进入下一步产能匹配分析
2. 趋势向上的品类加分20%
3. 有海关出口数据支撑的品类加分10%
4. 纯概念/无搜索量的品类标记为"待观察"不入推荐

## 数据来源优先级
1. Google Trends (主要趋势信号)
2. 海关出口HS编码数据 (需求验证)
3. 竞品站流量估算 (竞争格局)
4. VMT历史询盘数据 (已有需求验证)
