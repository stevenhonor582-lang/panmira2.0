---
name: vmt-data-monitoring
description: "P3推广: 数据监控——监控已发布页面流量/排名/转化,识别优化机会"
user_invocable: false
context: fork
allowed_tools: Read, Write, Bash
---

# VMT 数据监控与优化

## 功能边界
监控已发布页面的流量/排名/转化数据,识别优化机会。

## 数据源
1. Google Search Console: 排名+点击+展示+CTR
2. Google Analytics: 流量+停留时间+跳出率
3. 表单提交量: VMT询盘数据

## 核心指标
```
展示量: 页面在搜索结果中被看到的次数
点击率(CTR): 点击/展示
平均排名: 在搜索结果中的位置
停留时间: 用户在页面上的时间
跳出率: 只看一页就离开的比例
转化率: 表单提交/页面访问
```

## 问题诊断矩阵
| 症状 | 诊断 | 优化方向 |
|------|------|---------|
| 高展示低点击 | Title/Description不吸引人 | 优化Title加差异化价值,Description加CTA |
| 高点击低停留 | 内容与搜索意图不匹配 | 重新分析关键词意图,调整内容方向 |
| 高跳出率 | 缺少内链/CTA/下一步 | 增加内链和CTA |
| 低转化率 | 信任不够/CTA不明确 | 加强案例/信任信号,CTA前置 |

## 输出
```json
{
  "performanceReport": [{
    "url": "/services/cnc-aluminum-machining/",
    "dateRange": "2026-05-19 - 2026-05-26",
    "impressions": 1200,
    "clicks": 48,
    "ctr": 0.04,
    "avgPosition": 8.5,
    "conversions": 2,
    "conversionRate": 0.042,
    "diagnosis": "high_impressions_low_ctr",
    "optimizationSuggestions": [
      "Title currently 'CNC Aluminum Machining Services | VMT' — consider adding differentiator like '±0.005mm | 24h Quote'",
      "Meta description missing CTA — add 'Upload your design for a quote within 24 hours'"
    ]
  }]
}
```

## 关键规则
1. 数据报告每周至少一次
2. 优化建议有具体数据支撑(不靠猜)
3. 一次只改一个变量,改后监控7天再评估
