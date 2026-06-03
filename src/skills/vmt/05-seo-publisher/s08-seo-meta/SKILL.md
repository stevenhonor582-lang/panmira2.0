---
name: vmt-seo-meta
description: "P2发布: SEO元数据生成——Title/Description/H标签/Schema/OpenGraph自动生成"
user-invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT SEO元数据生成

## 功能边界
为每个页面生成完整的SEO元数据: Title, Meta Description, H标签层级, Schema.org结构化数据, Open Graph标签。

## Title生成规则
```
产品页: [主关键词] | VMT
文章页: [标题] | VMT Precision Manufacturing
长度: 50-60字符
```

## Meta Description规则
```
公式: [做什么] + [为谁] + [差异化] + [CTA]
长度: 140-160字符
必须含主关键词
```

## Schema.org生成
- 产品页: Product Schema + FAQ Schema + BreadcrumbList + LocalBusiness
- 文章页: Article Schema + FAQ Schema + BreadcrumbList
- FAQ标记: 每个FAQ问答对独立标记

## H标签层级
```
H1: 页面唯一,含主关键词
H2: 模块标题(4-8个)
H3: 模块内子标题(按需)
```

## Open Graph
```html
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:image" content="...">
<meta property="og:type" content="website/article">
```

## 输出
```json
{
  "seoMeta": {
    "title": "CNC Aluminum Machining Services | VMT",
    "metaDescription": "Factory-direct CNC aluminum machining. ±0.005mm tolerance, 50+ materials, 24-hour quotes. ISO 9001 certified. Serving medical, automotive, and robotics industries.",
    "h1": "CNC Aluminum Parts Manufacturing",
    "h2s": ["Precision You Can Verify", "Materials We Work With", "Quality Assurance", "Frequently Asked Questions"],
    "schemas": ["Product", "FAQ", "BreadcrumbList", "LocalBusiness"],
    "ogImage": "/images/og/cnc-aluminum-og.webp"
  }
}
```

## 关键规则
1. Title不超60字符,Description不超160字符
2. H1唯一,层级不跳跃(不H1→H3)
3. Schema标记必须语法正确(用Google Rich Results Test验证)
4. FAQ Schema只标记有完整问答对的内容
