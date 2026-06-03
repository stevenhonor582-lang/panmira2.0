---
name: vmt-competitor-analysis
description: "P0选品: 拆解Top5竞品产品线结构，找竞品做得一般但VMT能做更好的品类缺口"
user-invocable: false
context: fork
allowed-tools: Read, Grep, WebSearch, WebFetch
---

# VMT 竞品产品线拆解

## 功能边界
拆解Top5竞品的产品线结构：主推什么、放弃什么、定价区间、优势品类、薄弱品类。

## 输入
- 竞品网站URL列表
- 竞品产品目录(如有PDF)
- R1-竞品库已有数据

## 输出
```json
{
  "competitorMatrix": [{
    "competitor": "RapidDirect",
    "url": "rapiddirect.com",
    "categories": ["CNC铣削", "CNC车削", "5轴", "EDM", "钣金"],
    "mainPush": "CNC铣削+即时报价",
    "priceRange": "$$",
    "strengths": ["即时报价系统", "视频FAQ", "认证齐全"],
    "gaps": ["行业垂直解决方案偏弱", "技术文章深度不足"],
    "vmtOpportunity": "行业深耕+技术内容深度"
  }],
  "summary": {
    "commonCategories": ["CNC铣削", "CNC车削"],
    "underservedCategories": ["微细加工", "特殊材料零件"],
    "oversaturatedCategories": ["标准CNC加工"]
  }
}
```

## 关键规则
1. 找"竞品做得一般但我们能做更好"的品类作为gap
2. gap = 竞品有但很弱 OR 竞品完全没有但搜索量存在
3. 每个竞品至少拆解5个维度：产品线/定价/信任信号/内容质量/技术深度
4. 不攻击竞品，客观陈述事实

## 竞品站点清单(CNC精密加工领域)
1. RapidDirect (rapiddirect.com) — MaaS模式标杆
2. Fictiv (fictiv.com) — 数字化平台标杆
3. Hubs (hubs.com) — 分布式制造标杆
4. Protolabs (protolabs.com) — 快速打样标杆
5. Starrapid (starrapid.com) — 垂直品类标杆
