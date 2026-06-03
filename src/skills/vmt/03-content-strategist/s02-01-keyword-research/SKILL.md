---
name: vmt-keyword-research
description: "P2内容策略: 关键词研究——从目标品类出发，挖掘产品词/问题词/场景词/对比词"
user-invocable: false
context: fork
allowed_tools: Read, WebSearch, WebFetch, Grep, Write
---

# VMT 关键词研究

## 功能边界
从目标品类出发，系统挖掘四类关键词：产品词、问题词、场景词、对比词。

## 输入
- 目标品类(如"CNC aluminum machining")
- 目标市场(如"US, EU")
- R3-SEO/关键词库已有数据

## 输出
```json
{
  "keywordMap": {
    "productKeywords": [
      { "keyword": "CNC aluminum machining services", "volume": 5400, "difficulty": "medium", "intent": "transactional" },
      { "keyword": "custom aluminum parts manufacturer", "volume": 3200, "difficulty": "medium", "intent": "transactional" }
    ],
    "problemKeywords": [
      { "keyword": "how to choose aluminum alloy for CNC", "volume": 1800, "difficulty": "low", "intent": "educational" }
    ],
    "scenarioKeywords": [
      { "keyword": "CNC aluminum for medical devices", "volume": 1200, "difficulty": "low", "intent": "investigative" }
    ],
    "comparisonKeywords": [
      { "keyword": "6061 vs 7075 aluminum CNC cost", "volume": 900, "difficulty": "low", "intent": "comparative" }
    ]
  }
}
```

## 关键词优先级评分
搜索量 × 意图匹配度 × 竞争难度(反向) = 优先级分
- >80: P0核心词
- 50-80: P1扩展词
- <50: P2长尾词

## 关键规则
1. 产品词分配给产品页，问题/场景/对比词分配给文章页
2. 竞争度太高的词(新站无法竞争)→标记为"长期目标"
3. 零搜索量词→不纳入计划
4. 注意关键词蚕食: 同一词不要匹配多个页面
