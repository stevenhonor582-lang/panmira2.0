---
name: vmt-publish-output
description: "P2发布: 发布输出——组装完整HTML页面+素材需求单+发布检查清单"
user-invocable: false
context: fork
allowed_tools: Read, Write, Bash
---

# VMT 发布输出

## 功能边界
组装完整HTML页面,输出素材需求单,执行10项发布检查清单。

## 输出物
1. 完整HTML文件(含meta+Schema+CSS变量+响应式)
2. 素材需求单(哪些图需要拍/做)
3. 发布检查清单执行记录

## 发布节奏控制
- VMT新站策略: 1-2页/天
- 优先发布: 核心能力页 → 热门材料页 → 行业应用页 → 长尾文章

## 10项发布检查清单
```
□ 标题含主关键词
□ Meta Description ≤ 160字符且含CTA
□ H1唯一,H2-H3层级合理
□ 每屏至少1个内部链接
□ 所有图片有ALT文本
□ FAQ Schema标记正确(Google Rich Results Test验证)
□ 无语法错误(拼写检查通过)
□ 技术参数与R4-技术库一致(交叉验证)
□ 信任信号数据可验证(有来源)
□ 页面在移动端可读(响应式检查)
```

## 关键规则
1. 10项全部通过才发布
2. 发布后记录URL+发布日期到R3-SEO库
3. 新页面发布后通知推广运营师(S03)
