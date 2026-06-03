---
name: vmt-internal-linking
description: "P2发布: 内链规划——基于页面关系图谱自动生成内链锚文本方案"
user-invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 内链规划器

## 功能边界
基于页面关系图谱,为每个模块自动生成指向其他相关页面的内链锚文本方案。

## 内链规则
```
内链方向:
  文章页 ──→ 产品页 (转化出口)
  产品页 ──→ 产品页 (能力交叉引用)
  产品页 ──→ 技术资源页 (深入了解)
  技术资源页 ──→ 产品页 (转化)

每个页面的内链密度:
  - 每屏至少1个内部链接
  - 全文内链总数: 产品页5-12个, 文章页3-8个
```

## 锚文本规范
- 精确匹配: 目标页的主关键词 → 对SEO最好
- 部分匹配: 目标页关键词的变体
- 自然语言: "learn more about [topic]" / "see our [service]"
- 禁止: "click here" / "read more" / "learn more" (无上下文)

## 输出
```json
{
  "internalLinks": [{
    "sourceModule": "M04-TechSpecs",
    "sourceAnchor": "50+ materials in stock",
    "targetUrl": "/materials/",
    "targetPage": "材料总览页",
    "anchorType": "partial_match"
  }, {
    "sourceModule": "M11-FAQ",
    "sourceAnchor": "upload your design for a specific quote",
    "targetUrl": "#quote-form",
    "targetPage": "报价表单(同页锚点)",
    "anchorType": "natural"
  }],
  "orphanCheck": [],
  "linkGraph": "..."
}
```

## 关键规则
1. 不链接到不存在的页面(404)
2. 不出现孤岛页面(没有其他页面指向它)
3. 同页锚点用#hash,跨页用完整URL
4. 最重要的页面(核心能力页)获得最多内链
