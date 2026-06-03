---
name: vmt-social-distribution
description: "P3推广: 社媒内容分发——将已发布页面适配为LinkedIn/Twitter/Reddit/FB帖子"
user-invocable: false
context: fork
allowed_tools: Read, Write
---

# VMT 社媒内容分发

## 功能边界
将已发布的产品页/文章,适配为各社媒平台的短文/帖子。

## 各平台适配规则

### LinkedIn (工程师社区)
- 语气: 专业洞察,行业视角
- 长度: 150-250词
- 结构: 行业痛点→VMT解决方法→效果数据→文章链接
- 标签: 3-5个行业标签
- 配图: 零件/车间照片(非营销图)

### Twitter/X (行业话题)
- 语气: 简洁观点,数据冲击
- 长度: 280字符以内
- 结构: 结论+数据+链接
- 标签: 1-2个话题标签

### Reddit (r/CNC, r/Machinists, r/Manufacturing)
- 语气: 实用价值,同行交流
- 结构: 提供有价值的信息→自然提及VMT内容→链接
- 关键: ≥80%是内容价值,≤20%是品牌露出
- 禁止: 纯广告贴

### Facebook Groups (制造社群)
- 语气: 社区参与,经验分享
- 结构: 案例故事→经验教训→引导讨论→链接

## 输出
```json
{
  "socialPosts": [{
    "platform": "linkedin",
    "text": "...",
    "hashtags": ["#CNCmachining", "#Manufacturing", "#PrecisionEngineering"],
    "imageUrl": "/images/social/linkedin-post-001.webp",
    "bestPostingTime": "Tuesday 10am EST"
  }]
}
```

## 关键规则
1. 每个平台独立适配,不是一键多平台转发
2. 发布时机: LinkedIn周二三四最好,Reddit周末
3. 每个帖子配图(有图的帖子互动率3x更高)
