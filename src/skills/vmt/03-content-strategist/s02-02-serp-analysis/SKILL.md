---
name: vmt-serp-analysis
description: "P2内容策略: SERP分析——抓取目标关键词Top5页面，提取模块结构+关键词覆盖"
user-invocable: false
context: fork
allowed-tools: Read, WebFetch, WebSearch, Write
---

# VMT SERP分析

## 功能边界
输入目标关键词，抓取Google Top5页面，提取：模块结构、关键词覆盖、内容深度。

## 输入
- 目标关键词
- 目标URL列表(SERP Top5)
- R1-竞品库已有数据

## 输出
```json
{
  "serpAnalysis": {
    "keyword": "CNC aluminum machining services",
    "topPages": [{
      "url": "...",
      "title": "...",
      "modules": ["Hero", "TrustSignals", "Overview", "TechSpecs", "FAQ", "QuoteForm"],
      "wordCount": 2500,
      "coveredKeywords": ["cnc aluminum", "aluminum machining", "cnc services"],
      "missingKeywords": ["6061 aluminum cnc", "aluminum parts tolerance"],
      "contentDepth": "medium",
      "strengthAreas": ["即时报价系统", "案例丰富"],
      "weakAreas": ["技术参数不够详细", "行业应用覆盖少"]
    }],
    "moduleFrequency": { "Hero": 5, "TrustSignals": 5, "TechSpecs": 4, "FAQ": 4 },
    "keywordGaps": ["6061 aluminum cnc tolerance", "aluminum machining cost guide"],
    "recommendedModules": ["Hero", "TrustSignals", "Overview", "TechSpecs", "MaterialSelector", "FAQ", "QuoteForm"]
  }
}
```

## 关键规则
1. 提取每个竞品页面的模块结构(对照M00-M13模块库)
2. 识别竞品覆盖了哪些长尾词(我们也要覆盖的)
3. 识别竞品没覆盖的关键词缺口(我们差异化竞争的机会)
4. 综合Top5的模块频率，推荐我们应该包含的模块组合
