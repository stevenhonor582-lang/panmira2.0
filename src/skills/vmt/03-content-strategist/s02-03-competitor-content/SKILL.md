---
name: vmt-competitor-content
description: "P2内容策略: 竞品内容拆解——深入分析竞品页面内容质量、写作策略、差异化定位"
user-invocable: false
context: fork
allowed_tools: Read, WebFetch, WebSearch
---

# VMT 竞品内容拆解

## 功能边界
深入分析竞品页面内容：写作策略(往上写/往下写/对比写/教育写)、内容质量、差异化定位。

## 输入
- SERP Top5 URL列表
- 目标品类关键词

## 输出
```json
{
  "competitorContentAnalysis": [{
    "url": "...",
    "writingStrategy": "data-driven",
    "strategyType": "往上写(数据证明)",
    "toneOfVoice": "专业技术型",
    "trustBuilding": ["数字背书(5000+项目)", "认证展示(ISO 9001)", "真实案例"],
    "aiSmellScore": 2,
    "aiSmellIndicators": ["少量'industry-leading'用词", "一段话过长"],
    "differentiation": "即时报价是核心差异点",
    "weaknessForUs": "行业垂直内容薄弱,通用描述多",
    "learnings": ["FAQ用客户原话写法", "Hero配真实车间照片", "技术参数有对比列"]
  }],
  "synthesis": {
    "bestPractices": ["数据+意义转化", "真实案例主导", "第三方认证背书"],
    "commonWeaknesses": ["行业垂直内容不足", "AI味偏重", "设计指南缺失"],
    "vmtDifferentiationOpportunities": ["行业深耕(医疗/机器人)", "直营工厂透明化", "教育型内容体系"]
  }
}
```

## AI味评分标准
0-2: 无明显AI味(自然)
3-5: 局部AI味(可接受的)
6-8: 明显AI味(需优化)
9-10: 完全AI直出(不可用)

## 关键规则
1. 不只说竞品做了什么，更要说竞品没做什么(我们的机会)
2. Writing strategy判断: 往上写(data-driven)/对比写(competitor)/教育写(educational)
3. 提取可复用的最佳实践,标注为"learnings"
