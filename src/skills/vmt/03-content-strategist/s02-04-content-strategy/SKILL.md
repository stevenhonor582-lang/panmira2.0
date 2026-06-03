---
name: vmt-content-strategy
description: "P2内容策略: 生成内容策略——输出页面类型决策+模块组合+关键词映射+写作策略"
user-invocable: false
context: fork
allowed-tools: Read, Write, Bash
---

# VMT 内容策略生成

## 功能边界
综合S02-01/02/03的输出，生成最终内容策略：页面类型决策+模块组合+关键词分配+写作策略。

## 输入
- S02-01 关键词研究结果
- S02-02 SERP分析结果
- S02-03 竞品内容拆解结果

## 输出
```json
{
  "contentStrategy": {
    "pages": [{
      "targetKeyword": "CNC aluminum machining services",
      "pageType": "service",
      "url": "/services/cnc-aluminum-machining/",
      "modules": {
        "required": ["M01-Hero", "M02-TrustSignals", "M03-Overview", "M04-TechSpecs", "M12-QuoteForm"],
        "recommended": ["M05-MaterialSelector", "M06-CaseStudy", "M07-Quality", "M11-FAQ"],
        "optional": ["M08-SurfaceFinish", "M09-IndustryApps", "M10-DesignGuide"]
      },
      "writingStrategy": "往上写(data-driven)",
      "primaryKeywords": ["CNC aluminum machining services"],
      "secondaryKeywords": ["custom aluminum parts", "aluminum CNC manufacturing"],
      "longTailKeywords": ["6061 aluminum CNC tolerance", "aluminum machining cost per hour"],
      "competitorGapsToFill": ["行业应用案例", "材料选择指南"],
      "differentiationAngle": "直营工厂+行业深耕(医疗/机器人)",
      "estimatedWordCount": 2500
    }, {
      "targetKeyword": "how to choose aluminum alloy for CNC",
      "pageType": "article",
      "articleTemplate": "B-工艺解构型",
      "url": "/articles/how-to-choose-aluminum-alloy-cnc/",
      "modules": {
        "required": ["M00-ArticleIntro", "M11-FAQ", "M13-BrandConversion"],
        "recommended": ["M05-MaterialSelector", "M10-DesignGuide"]
      },
      "writingStrategy": "教育写(educational)",
      "estimatedWordCount": 3000
    }]
  }
}
```

## 页面类型决策规则
- 产品词/厂商词 → 产品页 → 硬广模版
- 问题词/场景词 → 文章页 → 软广模版(A/B/C/D选一)
- 对比词 → 文章页 → 对比矩阵型(D)

## 写作策略选择
- 往上写(data-driven): 用数据证明能力 → 适合产品页
- 对比写(competitor): 与竞品对比 → 适合竞品对比文章
- 教育写(educational): 教客户怎么选 → 适合指南/教程类文章
